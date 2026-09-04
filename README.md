# Petri

A 2D cellular life simulation that runs entirely in the browser — no
backend, no server, no database. Organic "cells" with a small inherited
genome move, eat, reproduce, poison each other, and die across a fixed
grid; dead cells and metabolic waste become inert mineral matter that
other cells can consume in turn.

Open the deployed page and watch (see **Deployment** below for the URL
once GitHub Pages is enabled). Everything runs client-side in a single
bundled JS file with Canvas2D rendering.

> Re-implementation of Bacillus, built without major human commits — only
> an AI agent, working from a behavioral spec.

## Try it locally

```bash
npm ci
npm run dev       # Vite dev server with hot reload
```

Other scripts:

```bash
npm run build      # typecheck + production build to dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run coverage   # vitest run --coverage (lcov + text report)
```

## Architecture

- **`src/engine/`** — the simulation core. Pure logic, no DOM access, no
  rendering. Deterministic: all randomness is injected through an `RNG`
  interface (`src/engine/rng.ts`), so tests control outcomes exactly via a
  mock implementation instead of depending on `Math.random()`.
  - `types.ts` — `Substance`, `DNA`, `Organic`, `Mineral`, `Entity`.
  - `grid.ts` — flat array-backed grid (occupancy lookup is O(1); range
    queries are O(radius²), never O(population)); `entities`/`organics`/
    `minerals` are backed by incrementally-maintained sets, so they're
    O(population), never O(width×height)).
  - `dna.ts` — DNA generation and mutation.
  - `settings.ts` — all tunable simulation parameters (see table below),
    no hardcoded literals in the phase logic.
  - `presets.ts` — named scenario presets (#32): each is a `Settings`
    overrides bundle + an initial seeding recipe (population count, extra
    scattered minerals, and a `genomeMode` — independently-random DNA per
    organic, one shared DNA across the whole population, or independently-
    random DNA with a fully randomized instruction matrix instead of the
    tuned starter genome). `buildScenario()` builds a fresh `Simulation`
    from a preset in one call, reusing `Simulation.spawnRandomOrganic`/
    `spawnRandomMineral` (both drawing from the same `Simulation.rng`, kept
    public for exactly this) rather than duplicating grid/RNG plumbing.
  - `phases.ts` — the eight tick phases, each independently exported and
    unit-testable in isolation.
  - `simulation.ts` — orchestrates the phases into one `tick()`, plus a
    `Simulation` class wrapping grid + settings + RNG + id/tick counters
    for the UI to drive. `toState()`/`fromState()` (#29) snapshot/restore
    the whole thing — settings, RNG state, counters, and every entity — as
    plain JSON (`SimulationState`), for save/load; requires a `SeededRNG`,
    since that's the only `RNG` whose state can be read back.
- **`src/ui/`** — Canvas2D renderer (`renderer.ts`) that reads a `GridView`
  (`src/engine/types.ts` — just `width`/`height`/`entities`, decoupled from
  the `Grid` class) and draws it; organics render brighter with a white
  outline, minerals render dimmer and borderless, both colored by substance.
- **`src/worker/`** — the `Simulation` (grid, settings, RNG, tick loop) runs
  off the main thread in a dedicated Worker (`simulation-worker.ts`), so
  rendering stays smooth regardless of population size or tick rate. The
  worker owns simulation state exclusively; the main thread never mutates it
  directly, only sends control messages (pause, speed, spawn, `exportState`/
  `importState` for #29's save/load) and receives state snapshots — see
  `protocol.ts` for the message shapes. `importState` replaces the worker's
  `Simulation` wholesale (settings included, since a loaded save may have
  different grid dimensions), rather than mutating it in place.
- **`src/main.ts`** — wires the renderer to a `requestAnimationFrame` loop
  that draws whatever snapshot the worker last posted (decoupled from the
  worker's own tick rate, which a speed slider controls via a
  `setTicksPerSecond` message, not frames-per-second), and hooks up
  controls: pause/resume, add-random-creature, pointer-based tap/click-to-add
  directly on the grid (works with touch and mouse alike), and the Controls
  menu's Save/Load group (`src/ui/persistence.ts`): Save/Load round-trip a
  snapshot through this browser's IndexedDB for quick resume (not
  `localStorage` — a snapshot's entities each carry a full 25-entry
  instruction matrix, so a long-running default grid's JSON easily reaches
  several megabytes, comfortably past `localStorage`'s ~5-10MB per-origin
  quota; IndexedDB's is tied to available disk space instead); Export/
  Import round-trip it through a downloaded/picked JSON file for sharing a
  run with someone else — both paths go through the same worker
  `exportState`/`importState` messages and `SimulationState` shape; and the
  Controls menu's Scenario group (#32), built from `engine/presets.ts`'s
  `SCENARIO_PRESETS` rather than hand-written per preset so the menu and the
  engine's preset list can't drift apart — picking one posts an
  `applyPreset` message that replaces the worker's running `Simulation`
  wholesale, the same "act immediately, no confirmation" pattern as Load.

## Domain model summary

Each grid cell holds at most one `Organic` (living cell) or `Mineral`
(inert matter), or nothing. Every tick runs, in order, over the whole
population: **decide direction → move/bite → reproduce → consume →
produce waste → toxin damage → exhaust (age/decay) → cleanup (death)**.
See the JSDoc on each function in `src/engine/phases.ts` for the exact
per-phase rules.

### Settings (`src/engine/settings.ts`)

| Parameter | Default | Meaning |
|---|---|---|
| `biteYield` | 200 | energy gained from biting an adjacent food entity while moving |
| `sunYield` | 25 | energy gained per tick by Sun-consumers |
| `mineralsYield` | 10 | max amount drained from a matching mineral/organic per tick (passive digestion) |
| `moveConsumption` | 10 | energy cost of taking a move step |
| `permanentConsumption` | 10 | base metabolic energy cost per tick, always applied |
| `productionPerformance` | 0.1 | fraction of consumed food lost to inefficiency, becomes waste |
| `mineralDegradation` | 3 | mineral size decay per tick |
| `defaultSize` | 750 | starting size of a spawned/offspring organic |
| `reproductionThreshold` | 2000 | energy level that triggers splitting |
| `maxSize` | 2200 | hard cap on size/energy (`reproductionThreshold + biteYield`) |
| `maxAge` | 1500 | organic dies of old age at this tick count |
| `visionRange` | 1 | radius (Chebyshev) for spotting food to move toward |
| `consumingRange` | 2 | radius for passive mineral/organic digestion |
| `productionRange` | 1 | radius for depositing waste as minerals |
| `toxinRange` | 2 | radius within which toxin sources damage a cell |
| `reproductionRange` | 1 | radius offspring can be placed at, relative to parent |
| `mutationRate` | 0.01 | probability a single DNA trait mutates on reproduction |
| `returnHealthWhenReproductionFails` | 0.5 | fraction of spent energy refunded if reproduction can't place the offspring |

All range checks use Chebyshev distance (`max(|dx|,|dy|)`) and are
inclusive (a cell is "in range" when its distance is `<= range`).

### Judgment calls made (spec didn't pin these down)

- **Reproduction placement** is a single random offset attempt within
  `reproductionRange`; if that one cell is occupied or off-grid, the split
  fails and refunds, rather than scanning for any free cell in range —
  this matches the spec's "a random offset... if that cell is occupied"
  wording literally.
- **Passive digestion / vision scans** iterate matching entities in the
  range nearest-first, but no early-exit optimization was added beyond
  what `gainEnergy`'s own cap enforces — correctness doesn't depend on
  stopping early, so the extra bookkeeping wasn't worth the complexity.
- **Bite/drain mechanics** reduce a target's `size` directly (clamping its
  `energy` down to match), so a bitten/drained organic dies through the
  normal cleanup phase rather than a special-cased instant death.
- **Sun consumption** doesn't go through the `productionPerformance`
  waste split — the spec ties that split to "the raw amount drained"
  (a physical entity), and Sun is ambient, not drained from anything.
- **Newborn organics** start at `energy == size` (full tank) — the spec
  doesn't say explicitly, but "DefaultSize... starting size" reads most
  naturally as a full starting reserve.

### Instruction-matrix findings (#12)

Once the instruction matrix (#5) was driving behavior end-to-end, #12 tracked
down its open questions against actual runs (`test/engine/determinism.test.ts`,
`test/engine/stability.test.ts`):

- **RNG determinism** — `decideAction`'s per-tick `Random`-sensor draw (and
  every other random choice: movement, reproduction, mutation) flows through
  the single `RNG` instance injected into `Simulation`, consumed in a fixed
  order (`grid.organics()`'s registration order — each organic keeps the
  position it was first placed at for its whole lifetime; moving doesn't
  reorder it, see `Grid`'s `organicSet`/`mineralSet` in `grid.ts`). Two
  `Simulation`s seeded identically produce byte-for-byte identical grids
  after thousands of ticks; confirmed as a permanent regression test rather
  than a one-off check.
- **`produceWaste`'s Hold-gating safety valve** — an organic that never
  chooses `Produce (Release)` hoards `accumulatedWaste` indefinitely with no
  cap. Across extended runs (thousands of ticks, evolving populations) this
  doesn't produce degenerate always-poisoned lineages: hoarding only turns
  into self-damage on a `Release` attempt that can't fully place its waste,
  and the population as a whole stays healthy. No cap/force-release rule was
  added — same "accepted, not a bug" stance #5 already took for dead
  branches, now backed by a regression test instead of just an assumption.
- **Oscillating/unproductive loops** — a genome that never reaches a given
  action category (or cycles through states without changing its effective
  behavior) is possible and, per #5's resolved decisions, an accepted dead
  branch rather than a bug to special-case.
- **Balance** — with the default settings and `mutationRate`, population
  size oscillates rather than collapsing or exploding to fill the grid,
  across long runs with mutation-driven reproduction active. No default
  settings changed.

## Security & supply chain

Runtime dependencies are effectively zero: vanilla TypeScript + Canvas2D,
no UI framework, and nothing is fetched from a CDN at runtime — the
browser only ever loads the committed, Vite-bundled output. There are no
API keys or secrets in a static offline simulation, so the real attack
surface is the CI pipeline itself:

- `package-lock.json` is committed; every workflow installs with
  `npm ci --ignore-scripts` (pinned, hash-verified, no postinstall
  scripts run).
- Every third-party GitHub Action is pinned to a full commit SHA, not a
  floating tag.
- Each workflow defaults to `permissions: contents: read`; `pages:write`
  / `id-token:write` is added only on the Pages deploy job, and
  `contents:write` / `pull-requests:write` only on the PR-preview job
  (which needs to push to `gh-pages` and post/update a comment).
- No job uses `pull_request_target` — PR builds run under plain
  `pull_request`, which withholds write-scoped secrets from fork PRs by
  default.
- [`.github/dependabot.yml`](.github/dependabot.yml) covers both the npm
  and github-actions ecosystems; `dependency-review-action` runs on every
  PR and fails on newly introduced vulnerable/malicious packages. **This
  needs Dependency graph enabled** (Settings → Security → Dependency
  graph) — without it the job fails immediately with "Dependency review
  is not supported on this repository," confirmed by an actual PR run
  against this repo.
- GitHub secret scanning + push protection are expected to be enabled on
  this repo as a backstop (repo owner responsibility, not something a
  workflow can turn on).

## CI / Sonar setup (one-time, manual)

CI (`.github/workflows/ci.yml`) runs typecheck, `vitest run --coverage`
(fails the job itself if line coverage drops below 85% — see the
`coverage.thresholds` block in `vite.config.ts`), a SonarQube Cloud scan,
and a Quality Gate check that fails the job if the gate doesn't pass. To
make the Sonar steps work, in **this repo's** GitHub settings add:

1. **Secret** `SONAR_TOKEN` — a SonarCloud analysis token
   (Settings → Secrets and variables → Actions → *Secrets*).
2. **Variable** `SONAR_ORGANIZATION` — your SonarCloud organization key
   (Settings → Secrets and variables → Actions → *Variables*).
3. **Variable** `SONAR_PROJECT_KEY` — the SonarCloud project key you
   create for this repo (same *Variables* tab).
4. On **sonarcloud.io itself**, open the project → **Administration →
   Analysis Method** and turn **off** "Automatic Analysis." SonarCloud
   defaults new GitHub-imported projects to its own automatic scanning,
   which is mutually exclusive with the CI-based scan `ci.yml` runs — with
   both on, the scan fails with `You are running CI analysis while
   Automatic Analysis is enabled`, confirmed by an actual run against this
   repo.

Everything upstream of the Sonar step (typecheck, tests, coverage, build)
is confirmed green in Actions on this repo already; the Sonar step itself
fails until the three items above are filled in — that failure is
expected out of the box.

These aren't committed because they're specific to whoever's SonarCloud
account owns the analysis.

## Deployment

Both flows below publish to the same `gh-pages` branch — GitHub Pages
serves from either a branch or Actions-deploy artifacts, never both, and
`rossjrw/pr-preview-action` needs the branch-based one. **One manual step
required**: in this repo's Settings → Pages, set **Source: Deploy from a
branch**, branch **`gh-pages`**, folder **`/ (root)`** (this can't be done
from a workflow). Once set, the stable URL is
`https://<owner>.github.io/<repo>/`.

- **`main`** → [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
  builds the Vite production bundle and pushes it to the root of
  `gh-pages` on every push, retrying against the latest tip if a
  concurrent PR-preview push (below) lands first. Leaves any
  `pr-preview/` subfolders already on the branch untouched.
- **PRs** → [`.github/workflows/pr-preview.yml`](.github/workflows/pr-preview.yml)
  uses `rossjrw/pr-preview-action` to publish each open PR's build to its
  own subpath (`pr-preview/pr-<n>/`) on the same `gh-pages` branch,
  posts/updates a PR comment with the preview link, and tears it down when
  the PR closes. Previews only work for PRs from branches in this repo,
  not forks — forked PRs get a read-only `GITHUB_TOKEN` by default (this
  workflow deliberately avoids `pull_request_target` to keep it that way;
  a repo owner can opt forks in under Settings → Actions → General →
  Workflow permissions if desired).

No cloud account, no Docker, no server secrets — only the Sonar token
above.
