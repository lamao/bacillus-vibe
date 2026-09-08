# Petri

A 2D cellular life simulation that runs entirely client-side (TypeScript +
Canvas2D, Vite). See [README.md](README.md) for architecture, the engine's
settings/domain model, and CI/Sonar/deployment setup.

## Typical workflow

1. Create a new git branch for each feature or bug fix.
2. Implement new features or bug fixes.
3. Test your changes.
4. Create a pull request once task is completed and ready to review. Make PR draft until it's approved.
5. When everything is approved, merge the pull request, squash commits, and delete the feature branch.

## Build number

The page header always shows a build number (`#build-info` in `index.html`,
sourced from `__BUILD_ID__`, defined in `vite.config.ts`). It must stay
automatically generated — never hand-maintained — either derived from git
state (current approach: branch + commit count + short SHA) or some other
automatic scheme; either way it must change on every build so a stale/cached
deploy is immediately obvious instead of silently mistaken for the latest
one. When something "isn't showing up" on a deployed page (prod or a PR
preview), check this value first before assuming the code is wrong.
