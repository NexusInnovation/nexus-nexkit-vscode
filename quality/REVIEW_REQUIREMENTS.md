# Phase 7 Review Requirements Guide

## Purpose

This guide supports interactive review of requirements quality after Phase 6 verification.

## Current Requirement Health Snapshot

- Total requirements: 12
- Violated (from Phase 3/4 consensus): REQ-003, REQ-004, REQ-006, REQ-008, REQ-010
- Partially satisfied: REQ-001, REQ-002, REQ-005, REQ-007, REQ-009, REQ-011, REQ-012

## Review Checklist

1. Requirement clarity:

- Is each requirement executable as a test assertion?
- Are preconditions and acceptance conditions explicit?

2. Traceability:

- Does each requirement map to at least one bug finding or test?
- Is each bug mapped back to a requirement?

3. Scope quality:

- Are requirements implementation-neutral where possible?
- Are cross-platform constraints explicit when relevant (PowerShell vs POSIX)?

4. Risk prioritization:

- Critical/High requirements: REQ-006, REQ-003, REQ-004, REQ-008, REQ-010
- Confirm whether priority ordering reflects release risk.

## Recommended Immediate Requirement Refinements

1. REQ-006: explicitly require no-write on parse failure and include observable error path.
2. REQ-004: define byte-level preservation criteria with binary fixture requirement.
3. REQ-008: require argument-boundary parity proof across shell dialects.
4. REQ-010: require non-skipped CI enforcement and command-id synchronization strategy.
5. REQ-002: require idempotent handler registration test or explicit teardown behavior.

## Inputs for User Decisions

- quality/REQUIREMENTS.md
- quality/BUGS.md
- quality/TDD_TRACEABILITY.md
- quality/spec_audits/2026-07-24-triage.md
