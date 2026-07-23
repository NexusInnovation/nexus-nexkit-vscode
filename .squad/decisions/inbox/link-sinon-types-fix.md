## Decision: Bump `@types/sinon` to fix TS2694 compile failure (sinon/fake-timers type drift)

**Date:** 2026-07-23
**Agent:** Link
**Classification:** Project-specific — dependency/build fix

### Context

`npm run test` failed at the `pretest` step (`tsc -p ./`) with `TS2694: Namespace '.../@sinonjs/fake-timers/types/fake-timers-src' has no exported member 'FakeTimerInstallOpts'`. `package.json` pinned `"@types/sinon": "^17.0.3"` (installed 17.0.4) alongside `"sinon": "^21.0.0"` (installed 21.1.2), which pulls in `@sinonjs/fake-timers@15.4.0`. That major of `@sinonjs/fake-timers` restructured its exported types and no longer exposes `FakeTimerInstallOpts` in the shape `@types/sinon@17.x` expects — a types-only version mismatch, not a runtime bug.

### Decision

Bumped `@types/sinon` from `^17.0.3` to `^22.0.0` in `package.json` devDependencies (matches npm's current `latest` dist-tag, compatible with the already-installed `@sinonjs/fake-timers@15.4.0`). No source code changes were required — the newer `@types/sinon` major compiled cleanly against existing test usage with zero new type errors.

### Verification

- `npm install` — lockfile updated cleanly.
- `npx tsc -p ./` / `npm run test-compile` — clean, TS2694 errors gone.
- `npm run lint` — clean, no regressions.
- `npm test` — 381 passing, 8 pending, 1 failing. The 1 failure (`ConvertToMarkdownPanelService` → `save-to-file` → stubbing `vscode.workspace.fs.writeFile`) is a pre-existing, unrelated VS Code API immutability limitation ("property descriptor is non-configurable and non-writable" when Sinon tries to stub `vscode.workspace.fs.writeFile` in the Extension Development Host). Confirmed unrelated: `@types/sinon` is a types-only devDependency with zero runtime footprint, and the actual `sinon` runtime package version (`^21.0.0`) was untouched by this fix.

### Why (reusable pattern)

When a project pins `sinon` and `@types/sinon` independently, a `sinon`/`@sinonjs/fake-timers` transitive major bump can silently break the build even though `@types/sinon`'s own semver range didn't change (npm installs the newest version satisfying `^17.0.3` referencing the newest installed `@sinonjs/fake-timers`). **Keep `@types/sinon` tracking the same major-version cadence as `sinon`** (check `npm view @types/sinon dist-tags` for the version compatible with the installed TypeScript version) whenever `sinon` gets bumped, to avoid this class of type-only compile break.
