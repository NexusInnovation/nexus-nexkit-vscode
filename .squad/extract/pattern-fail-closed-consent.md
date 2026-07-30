# Pattern: consent dialogs must fail closed

**Classification:** Generic — applies to any project with modal confirmation prompts
**Origin:** Nexkit VS Code extension, 2026-07-30 (Link, from a Morpheus review finding)

## The rule

A dialog that gates a **write or an execution** must treat *every* outcome that is not an explicit affirmative as a refusal. Dismissal is not consent.

Write the affirmative branch as an explicit equality check with refusal as the fallthrough default — never the inverse.

```ts
// Correct — unknown outcomes fall through to refusal
if (result === "Accept") {
  return "accepted";
}
return "refused";

// Wrong — unknown outcomes (including `undefined`) become consent
if (result === "Refuse" || result === "RefuseForever") {
  return "refused";
}
return "accepted";
```

## Why this bites

Most UI toolkits resolve a dismissed modal to a falsy/absent value rather than a distinct sentinel — `vscode.window.showInformationMessage` resolves to `undefined` on Escape, close button, or focus loss. A negative-list check (`!== "Refuse"`) silently folds dismissal, focus loss, and future new button values into the accept path. A positive-list check (`=== "Accept"`) folds them into the refuse path, which is the safe direction.

## Refuse for this invocation, not forever

Distinguish "declined now" from "declined permanently", and **never persist** a suppression flag from an ambiguous dismissal. Persisting it turns one accidental keystroke into a silent, permanent feature lockout that the user has no obvious way to undo. The cost of failing closed should be exactly **one extra prompt**.

## Re-evaluate the default when the blast radius changes

A "dismiss = accept" default can be a defensible UX call *while every gated operation is non-destructive*. It stops being defensible the moment the same gate starts guarding a config write with machine-global scope, or the execution of code sourced from the workspace. When a shared consent service gains a new caller, re-audit the default against that caller's blast radius — the original reasoning may no longer hold.

## Audit the whole surface, not just the service

Grep for the service's method name **and** for direct calls to the underlying dialog API. Consent decisions that bypass the shared service will not appear in a call-site search of the service, and are therefore invisible to exactly the audit most likely to be run.

## The test smell

A test named along the lines of *"returns accepted when the user dismisses the dialog"* is asserting the vulnerability as intended behaviour. When a suite is green **because** of a defect, the fix necessarily deletes a passing test. Deleting it is correct — replace it with regression tests that pin the fail-closed behaviour, and note the removal explicitly so it is not mistaken for reduced coverage.

**A green suite is not evidence of correct behaviour when a test encodes the defect as the expectation.**
