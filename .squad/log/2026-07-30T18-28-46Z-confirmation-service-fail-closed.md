# Session — ConfirmationService fail-closed consent fix

**Date:** 2026-07-30T18:28:46Z
**Requested by:** Eric Decarufel
**Agents:** Link (implementation), Scribe (memory)

## What happened

A single-agent follow-up slice, released from the open item Morpheus raised during the prerequisite-automation review.

`ConfirmationService.confirm()` was failing **open**: it returned `"accepted"` for anything that was not an explicit refusal, and `showInformationMessage` resolves to `undefined` on dismissal — so pressing Escape counted as consent. Link made the accept path an explicit `=== "Accept"` comparison with refusal as the default. Dismissal now returns `"refused"` rather than `"refused-forever"`, so an accidental Escape costs one extra prompt instead of silently locking the feature out of the workspace. The public `ConfirmationResult` union is unchanged.

Link audited all five call sites and confirmed fail-closed is correct at every one — each gates a write or an execution. `addUserMCPServer()` was the highest-value fix: a machine-global config write.

## Notable

The existing test `"Should return 'accepted' when user dismisses the dialog (ESC)"` asserted the vulnerability as intended behaviour. The suite had been green **because** of the bug. It was removed and replaced with three regression tests.

This decision supersedes Neo's Issue #162 UX contract ("ESC / dismiss = Accept", 2026-06-03, now in `decisions-archive.md`). That contract was defensible while every gated operation was non-destructive; prerequisite automation invalidated the premise by routing script execution through the same gate.

## Verification

Type-check 0 · lint 0 · **536 passing / 15 pending / 0 failing** (baseline 534 / 15 / 0).

## Open items carried forward

Two, both routed to Morpheus and recorded in `decisions.md`:

1. Callers 1–3 fail silently on refusal — pre-existing, shared with the Refuse path, needs its own slice.
2. `promptInstallRequiredMCPsOnActivation()` bypasses `ConfirmationService` entirely — no bug today, but invisible to a `.confirm(` grep.

## Memory outcome

Decision merged to `decisions.md`; generic principle extracted to `.squad/extract/pattern-fail-closed-consent.md`. Cross-agent notes appended to Morpheus, Trinity, and Ghost — dismissal no longer means consent. `link/history.md` and `trinity/history.md` crossed the 15 KB gate and were summarized.
