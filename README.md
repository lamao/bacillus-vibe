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
    queries are O(radius²), never O(population)).
  - `dna.ts` — DNA generation and mutation.
  - `settings.ts` — all tunable simulation parameters (see table below),
    no hardcoded literals in the phase logic.
  - `phases.ts` — the eight tick phases, each independently exported and
    unit-testable in isolation.
  - `simulation.ts` — orchestrates the phases into one `tick()`, plus a
    `Simulation` class wrapping grid + settings + RNG + id/tick counters
    for the UI to drive.
- **`src/ui/`** — Canvas2D renderer (`renderer.ts`) that reads engine
  state and draws it; organics render brighter with a white outline,
  minerals render dimmer and borderless, both colored by substance.
- **`src/main.ts`** — wires the renderer to a `requestAnimationFrame` loop
  decoupled from the tick rate (a speed slider sets ticks-per-frame, not
  frames-per-second), seeds an initial population, and hooks up controls:
  pause/resume, add-random-creature, and pointer-based tap/click-to-add
  directly on the grid (works with touch and mouse alike).

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
  PR and fails on newly introduced vulnerable/malicious packages.
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

These aren't committed because they're specific to whoever's SonarCloud
account owns the analysis.

## Deployment

- **`main`** → [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
  builds the Vite production bundle and deploys it to GitHub Pages via
  `actions/upload-pages-artifact` + `actions/deploy-pages` on every push.
  **One manual step required**: in this repo's Settings → Pages, set
  **Source: GitHub Actions** (this can't be done from a workflow). Once
  set, the stable URL is `https://<owner>.github.io/<repo>/`.
- **PRs** → [`.github/workflows/pr-preview.yml`](.github/workflows/pr-preview.yml)
  uses `rossjrw/pr-preview-action` to publish each open PR's build to its
  own subpath on the `gh-pages` branch (separate from the `main` deploy
  above, which uses the newer Actions-native Pages flow), posts/updates a
  PR comment with the preview link, and tears it down when the PR closes.
  Previews only work for PRs from branches in this repo, not forks —
  forked PRs get a read-only `GITHUB_TOKEN` by default (this workflow
  deliberately avoids `pull_request_target` to keep it that way; a repo
  owner can opt forks in under Settings → Actions → General → Workflow
  permissions if desired).

No cloud account, no Docker, no server secrets — only the Sonar token
above.
