# Trinity SQD-050 — Profile Squad integration tests

## Context

Issue #265 covers SQD-050 / FR-065: NexKit profiles must save, apply, and delete the optional Squad configuration section introduced by #263 without relying on external services.

## Decision

Add integration-style tests at the `ProfileService` boundary, not another lower-level `SquadProfileService` unit suite. The tests mock every external dependency (installed-template state, repository template data, backup service, VS Code settings/workspace state, and Squad profile service) while exercising the real profile orchestration paths.

## Coverage

- Saving a profile persists installed templates plus the full FR-065 `Profile.squad` contract.
- Saving without Squad markers remains backwards-compatible and omits the `squad` property.
- Squad capture/apply failures surface actionable remediation and do not emit success events.
- Applying a saved Squad profile installs templates, applies Squad config, returns the Squad outcome, and only then updates `lastAppliedProfile`.
- Deleting profiles removes only the requested profile and does not call Squad capture/apply services.

## Bug fixed

`ProfileService.applyProfile()` updated `lastAppliedProfile` before the Squad section completed. If Squad apply failed, the workspace still looked like the profile had succeeded. The fix moves `SettingsManager.setLastAppliedProfile()` after Squad success and includes Squad remediation text in thrown profile errors.

## Validation

`npm run check:types`, `npm run lint`, `npm run test-compile`, and `npm run test:unit` all passed (`978 passing / 11 pending`).
