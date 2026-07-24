# Phase 7 Requirement Refinement Protocol

## Objective

Drive focused improvement cycles without rerunning the entire playbook from scratch.

## Refinement Modes

### Mode A: Bug-Driven Refinement

Use when open bug set is known and requirements need stronger acceptance criteria.
Steps:

1. Pick one open bug cluster.
2. Tighten related requirement acceptance conditions.
3. Update regression tests to reflect new precision.
4. Re-run targeted verification.

### Mode B: Coverage-Driven Refinement

Use when requirement exists but behavioral edge coverage is weak.
Steps:

1. Identify untested branches/edge cases.
2. Add explicit "alternative path" acceptance bullets.
3. Add tests for each path.
4. Re-run TDD traceability check.

### Mode C: Release-Gate Refinement

Use when preparing merge/release decision.
Steps:

1. Tag requirements as BLOCKER/NON-BLOCKER.
2. Map each open bug to blocker status.
3. Emit release recommendation update.

## Suggested Priority Order for This Run

1. REQ-006 (MCP parse-failure preservation)
2. REQ-004 (byte-preserving rollback)
3. REQ-008 (shell-safe parameter encoding)
4. REQ-010 (activation contract CI enforcement)
5. REQ-003 (startup non-intrusiveness)

## Minimal Iteration Template

For each selected requirement:

- Requirement ID:
- Current weakness:
- Proposed revised acceptance criteria:
- Affected tests:
- Expected bug-status impact:

## Exit Criteria for a Refinement Iteration

- Requirement text updated and unambiguous.
- At least one regression/functional test updated or added.
- Traceability map updated.
- Release recommendation delta explicitly recorded.
