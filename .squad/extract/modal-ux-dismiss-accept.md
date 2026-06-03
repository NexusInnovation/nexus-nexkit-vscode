# Generic Decision: Modal Dialog UX — ESC/dismiss = Accept

**Date:** 2026-06-03  
**Source:** Issue #162 ConfirmationService  
**Context:** Nexus-nexkit-vscode confirmation flow for destructive operations  
**Extractable:** Yes (applies to any modal/confirmation UX)

## Decision

When the user closes a modal dialog without clicking a button (platform returns undefined), treat dismissal as **Accept** (proceed with operation).

**Rationale:** Dismissal is ambiguous. Defaulting to the non-destructive path (allowing the operation) is safer UX than silently skipping it. If the operation itself is destructive, the confirmation modal wouldn't be shown; the modal only protects against accidental permission grants or config overwrites.

## When This Pattern Applies

- User interactions with modals/confirmation dialogs that gate non-destructive config changes
- Ambiguous user intents (ESC, clicking outside modal, platform close button)
- Design principle: default to proceed unless user explicitly refuses
