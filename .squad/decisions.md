# Squad Decisions

## Decision: ConfirmationService UX contract (Issue #162)

**Date:** 2026-06-03
**Agent:** Neo
**Issue:** #162
**Classification:** Project-specific

### Context

A new ConfirmationService was added to gate destructive config-write operations (chat settings, MCP servers) behind a three-choice modal dialog.

### Decisions

#### ESC / dismiss = Accept

When the user closes the modal without clicking a button (showInformationMessage returns undefined), we treat it as Accept. Rationale: dismissal is ambiguous; defaulting to the non-destructive proceed is safer than silently skipping the operation.

#### Refuse Forever is workspace-scoped

The refused-forever flag is stored in workspaceState (not globalState). Rationale: users may want different confirmation behaviour per workspace.

#### workspaceToUserMigrationService not gated

The migration flow was explicitly excluded. It already has multi-step user consent built in.

#### Key structure: static strings + factory functions

CONFIRMATION_KEYS.CHAT_SETTINGS is a static string. CONFIRMATION_KEYS.mcpUserServer(name) and mcpWorkspaceServer(name) are factory functions allowing per-server key isolation, so refusing forever for one MCP server does not affect others.

---

## Decision: Nexkit panel home action placement

**Date:** 2026-06-05
**Agent:** Ghost
**Classification:** Project-specific

### Context

The requested home button needed to sit immediately to the left of the existing Save Current Profile action in the panel header bar.

### Decision

The home action was implemented as a contributed `view/title` command instead of a new webview DOM button. The existing save button already lives in the VS Code view title area via `package.json`, so matching that placement keeps the header actions consistent and preserves native VS Code styling and ordering.

The button visibility is driven by a VS Code context key (`nexkit.modeSelected`) derived from the current mode. This keeps the action hidden while the panel is already on the mode selection screen.

---

## Decision: GitHub Ruleset Validation — PRD open questions resolved

**Date:** 2026-07-08
**Agent:** Squad (Coordinator), approved by Eric Decarufel
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Morpheus's PRD for the GitHub Rulesets local-validation feature (`src/features/ruleset-validation/`) listed 4 open questions blocking implementation. Eric answered them directly.

### Decisions

1. **Initial notification requires explicit consent.** The first-time `showInformationMessage` is not merely informational — the user must actively approve ("Activer localement") before Nexkit installs any Git hooks. Silent/passive acceptance is NOT sufficient.
2. **Enforce at both `commit-msg` AND `pre-push` hooks.** Branch-name and commit-message validation must run at both stages, not just one.
3. **Regex/pattern matching is strict, not best-effort.** If a rule's pattern/operator cannot be evaluated with full parity to GitHub's semantics, it must be treated as unsupported (server-only) rather than approximated locally.
4. **Include inherited/org-level rulesets in V1.** Use `includes_parents=true` when calling `GET /repos/{owner}/{repo}/rulesets` so organization/enterprise-level rules are captured, not just repo-level ones.

### Impact on PRD

- §7 Étape 4 (notification): remove the "passive acceptance" alternative — consent flow is mandatory.
- §7 Étape 5 (hooks): both `commit-msg` and `pre-push` are in scope for V1 (already primary proposal — now confirmed, no fallback to single-hook).
- §6/§7: `RulesetPolicyCompilerService` must fail closed (mark as `unsupportedRules`) on any pattern it cannot strictly evaluate — no fuzzy/partial matching.
- §5 API integration: `includes_parents=true` is confirmed mandatory for V1, not optional.

---

## Decision: GitHub Ruleset Validation — Architecture (Lot 1 scope)

**Date:** 2026-07-08
**Agent:** Morpheus
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Nexkit must add local validations that mirror GitHub rulesets for the currently opened repository, but only when that repository is hosted on GitHub or GitHub Enterprise. The feature must remain non-blocking during activation, reuse existing GitHub authentication flows, and fit the current service-oriented architecture.

### Proposed decision

Implement the feature as a dedicated `ruleset-validation` feature with a two-layer design:

1. **Remote read layer** — a mockable GitHub ruleset client/provider that only reads rulesets and applicable branch rules from the GitHub REST API.
2. **Local enforcement layer** — a compiler/deployer that translates the supported subset of rules (`branch_name_pattern`, `commit_message_pattern`) into local Nexkit-managed hook artifacts and native Git hooks.

### Why

- Keeps GitHub API concerns isolated from hook generation and local file deployment.
- Makes unsupported rules explicit instead of overloading the hook deployer with partial API logic.
- Preserves testability: GitHub API, git remote detection, cache persistence, and hook rendering can be unit-tested independently.
- Supports future iterations where more ruleset types are translated without changing initialization orchestration.

### Initial boundaries

- **Read-only** against GitHub rulesets: no create/update/delete through Nexkit.
- **Supported V1 translations only:** branch naming and commit message rules.
- **Cache under `.nexkit/rulesets/`** to keep workspace-local state inspectable and portable with the repo clone.
- **User consent only on first successful sync per workspace/repository fingerprint**; subsequent refreshes run silently unless the cache becomes invalid or auth is lost.
