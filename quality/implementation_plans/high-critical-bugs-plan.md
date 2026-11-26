# Implementation Plan: High/Critical Bug Set

## Scope

Implement fixes for all High/Critical bugs discovered in the run:

- BUG-002 (Critical): MCP parse-failure destructive overwrite risk
- BUG-001 (High): passive startup auth prompt
- BUG-003 (High): watcher rollback not byte-safe
- BUG-004 (High): workflow command argument interpolation risk

## Objective

Move gate from PARTIAL toward PASS by eliminating highest release-risk defects first.

## Execution Order (Dependency-Aware)

1. BUG-002 (Critical) — config data-loss risk
2. BUG-004 (High) — command boundary/shell integrity risk
3. BUG-003 (High) — managed file data integrity risk
4. BUG-001 (High) — startup UX/non-intrusive behavior

Rationale: prioritize potential data loss and command execution integrity before UX-level disruption.

## Workstream A: BUG-002 (REQ-006, REQ-007)

- Implement malformed-config safe-fail path (no write on parse failure).
- Preserve valid-parse merge behavior and file-not-found bootstrap behavior.
- Add tests for malformed/missing/valid cases.

## Workstream B: BUG-004 (REQ-008)

- Replace direct string interpolation for event/job with shell-safe escaping strategy.
- Prefer argument-array style where possible; otherwise implement dialect-specific escaping helpers.
- Add adversarial input tests (quotes, backticks, spaces, separators, Unicode).
- Validate PowerShell/POSIX behavioral parity.

## Workstream C: BUG-003 (REQ-004)

- Move watcher cache/restore path from UTF-8 string to Buffer-safe representation.
- Preserve user-facing prompt behavior while making restore byte-exact.
- Add regression tests with non-UTF8 and binary-like fixtures.

## Workstream D: BUG-001 (REQ-003, REQ-011)

- Remove unconditional startup auth prompt path.
- Gate interactive auth prompt to explicit user-triggered GitHub actions.
- Keep CI and env-token/session shortcuts intact.
- Add startup behavior tests that assert no prompt on passive open.

## Cross-Cutting Validation

1. Run targeted unit tests by service area after each workstream.
2. Run quality/test_regression.js after each bug fix to track red->green transitions.
3. Update quality/results/tdd-results.json and BUG-00N logs as each bug transitions.
4. Re-run quality/mechanical/verify.js before finalizing.

## Definition of Done

1. BUG-001/002/003/004 regressions pass green.
2. No regressions introduced in existing service tests.
3. TDD traceability updated with green evidence for fixed bugs.
4. Completeness report updated with revised bug closure counts.

## Suggested Delivery in Two PR Batches

1. PR-1: BUG-002 + BUG-004 (critical integrity and shell safety)
2. PR-2: BUG-003 + BUG-001 (data fidelity and startup non-intrusive behavior)

## Estimated Review Focus

- Highest scrutiny: parse-path control flow and shell escaping correctness.
- Secondary scrutiny: watcher buffer migration and startup auth trigger points.
