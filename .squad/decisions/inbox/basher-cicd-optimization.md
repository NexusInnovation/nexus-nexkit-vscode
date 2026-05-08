# CI/CD Pipeline Optimization

**Date:** 2026-05-08
**By:** Basher (Platform Dev)
**Requested by:** Eric
**Status:** IMPLEMENTED

## Summary

Restructured the GitHub Actions CI/CD pipeline to reduce execution time and eliminate redundant work. Target: < 8 minutes pipeline time.

## Changes Made

### 1. `package.json` — Added `build:ci` script
- New script: `"build:ci": "node esbuild.config.js --production"`
- Runs esbuild in production mode WITHOUT lint/type-checking (already handled by `static-analysis` job)
- Used by `build`, `pr-preview` jobs, and `semantic-release` prepareCmd

### 2. `.releaserc.json` — Updated prepareCmd
- Replaced `npm run package` with `npm run build:ci` in semantic-release exec plugin
- Eliminates redundant lint + type-check during release (already validated upstream)

### 3. `.github/workflows/ci-cd.yml` — Full restructure

**Old structure:** `quality-gate` (3 OS × lint+types+compile+test) → `security` → `build` → `release`

**New structure:**

| Job               | Runs on                | Trigger           | Depends on                    |
| ----------------- | ---------------------- | ----------------- | ----------------------------- |
| `commitlint`      | ubuntu                 | PRs only          | —                             |
| `static-analysis` | ubuntu                 | all               | —                             |
| `test`            | ubuntu, windows, macos | all               | `static-analysis`             |
| `security`        | ubuntu                 | all               | —                             |
| `build`           | ubuntu                 | PRs only          | `static-analysis`, `security` |
| `release`         | ubuntu                 | push main/develop | `test`, `security`            |
| `pr-preview`      | ubuntu                 | PRs → develop     | `test`, `security`            |

**Key optimizations:**
- **Lint + type-check run once** on Ubuntu (`static-analysis`), not 3x across all OS
- **Tests skip `pretest`** by calling `node ./out/test/runTest.js` directly — avoids redundant `test-compile` + lint
- **`build` job is PR-only** — removed from push triggers (semantic-release handles its own build)
- **SBOM removed from `security` job** — generated only during release via `.releaserc.json`
- **`paths-ignore` removed** from PR trigger — ensures commitlint always fires, even on Markdown-only PRs
- **`static-analysis` and `security` run in parallel** (no dependency between them)

### 4. Deleted `.github/workflows/commitlint.yml`
- Merged into `ci-cd.yml` as the `commitlint` job
- Same behavior: runs on PRs only, validates commit messages, provides guidance on failure

## Estimated Time Savings

| Before                                 | After                | Savings                  |
| -------------------------------------- | -------------------- | ------------------------ |
| Lint × 3 OS                            | Lint × 1             | ~2 min                   |
| Type-check × 3 OS                      | Type-check × 1       | ~2 min                   |
| Double test-compile (pretest + manual) | Single test-compile  | ~1 min/OS                |
| SBOM in security + release             | SBOM in release only | ~30s                     |
| Build on push (redundant with release) | Build on PR only     | full job skipped on push |

## Risk Assessment

- **Low risk:** All the same checks still run — just reorganized for efficiency
- **Test coverage unchanged:** 3-OS matrix preserved
- **Release flow unchanged:** semantic-release still builds, packages, generates SBOM
- **Commitlint unchanged:** Same logic, just moved into the main pipeline
