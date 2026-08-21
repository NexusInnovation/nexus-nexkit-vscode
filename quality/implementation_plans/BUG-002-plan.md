# Implementation Plan: BUG-002 (Critical)

## Scope

Fix BUG-002 only: MCP config parse/read failures currently fall back to a fresh object and can overwrite existing configuration.

## References

- Bug: quality/BUGS.md (BUG-002)
- Requirements: REQ-006, REQ-007 in quality/REQUIREMENTS.md
- Current evidence:
  - src/features/mcp-management/mcpConfigService.ts:142
  - src/features/mcp-management/mcpConfigService.ts:144
  - src/features/mcp-management/mcpConfigService.ts:189

## Target Behavior

1. Parse/read failures in existing MCP config must not trigger destructive writes.
2. Existing bytes on disk must remain unchanged when parsing fails.
3. Caller receives actionable error context.
4. Behavior is consistent for both user-level and workspace-level MCP flows.

## Implementation Steps

1. Introduce explicit read/parse classification in updateMCPConfig path.

- Distinguish file-not-found from malformed JSON.
- Continue with fresh config only when file is absent.
- Abort update when malformed JSON is detected.

2. Add safe-fail return contract.

- Throw a typed error (or returned error object if existing style requires) with location scope (user/workspace) and remediation hint.
- Ensure callers propagate/log without fallback overwrite.

3. Prevent write on parse failure.

- Guard writeFile call so it executes only on valid parsed config or known non-existent file bootstrap path.

4. Preserve merge semantics.

- Keep current server merge and input dedupe logic unchanged when parse succeeds.

5. Add/adjust tests.

- Unit test: malformed JSON in existing config -> update API fails, file content unchanged.
- Unit test: missing config file -> create new valid config and persist update.
- Unit test: valid config merge path unchanged for both user/workspace entry points.

## Regression Mapping

- Update quality/test_regression.js BUG-002 check from textual heuristic to behavior assertion if practical.
- Keep red test failing on baseline and passing after fix.

## Acceptance Criteria

1. BUG-002 regression passes after fix.
2. REQ-006 and REQ-007 status improves to SATISFIED.
3. No data-loss path remains for malformed JSON configs.
4. Existing add/update MCP behavior remains backward-compatible on valid files.

## Risk Notes

- Avoid broad catch blocks that hide parse errors.
- Ensure error messages do not leak sensitive file contents.

## Suggested Commit Slice

1. mcpConfigService parse-path refactor + typed error.
2. tests for malformed/missing/valid scenarios.
3. update quality artifacts (BUGS/TDD/completeness) after green verification.
