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

---

## Decision: Ruleset API client pagination (Lot 2)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Implementation of the GitHub Rulesets API client layer for fetching rulesets from the REST API.

### Decision

The GitHub Rulesets client uses native `fetch` (like `extensionGitHubReleaseService`) and explicitly follows pagination via the HTTP `Link` header instead of assuming a single page response.

### Why

- The `GET /repos/{owner}/{repo}/rulesets` endpoint supports `per_page` and `page` parameters, so a V1 implementation must remain correct even for repositories inheriting many rulesets from organization/enterprise level.
- Centralizing GitHub header management, `GitHubAuthHelper` authentication, and error categorization in a dedicated client keeps Lot 3 focused on policy compilation rather than network details.

---

## Decision: Policy compiler and cache implementation details (Lot 3)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Implementation of policy caching and regex pattern validation for local ruleset enforcement.

### Decisions

1. **Policy hash computation** is implemented in `rulesetCacheService.ts` as an exported helper function (`computeRulesetPolicyHash`) reused by both the compiler and cache store to prevent divergence between the hash calculated during compilation and the hash persisted in cache.

2. **Strict regex validation** applies a fail-closed heuristic focused on GitHub/RE2 parity: any regex containing backreferences (`\1`–`\9`) or lookarounds (`(?=)`, `(?! )`, `(?<=)`, `(?<!)`)) is classified as `unsupportedRules`, even if JavaScript's `new RegExp()` accepts it.

### Why

- `sourceHash` must reflect a single canonical policy definition to correctly trigger silent redeployments when a ruleset changes.
- The product confirmed strict matching only: rejecting constructs known to diverge from RE2 avoids false positives/negatives between Nexkit's local validation and GitHub's server-side validation.

---

## Decision: Session-scoped decline caching (Lot 4)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Management of user consent state for the ruleset validation feature during VS Code sessions.

### Decision

When a user clicks **"Plus tard"** or dismisses the consent popup, `RulesetConsentService` treats that as a session-scoped decline and returns `already-declined-this-session` on subsequent calls for the same repository fingerprint during the same extension session.

### Why

The requested API explicitly exposes the `already-declined-this-session` result. An in-memory per-service cache avoids repeat consent prompts in the same session while preserving the product rule that dismissal is **not** approval and must not persist `approved=true`.

---

## Decision: Hook runtime path resolution (Lot 5)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Runtime configuration of generated Git hooks to handle edge cases like worktrees and separate gitDirs.

### Decisions

1. **Repository root resolution** in generated hook scripts under `.nexkit/git-hooks/` uses `__dirname` with a fixed path calculation (`repoRoot = path.resolve(__dirname, "..", "..")`) rather than `process.cwd()` to remain correct even when Git executes the hook from a different working directory or via a separate `gitDir` (worktree).

2. **Pre-push commit range** calculation: when the remote SHA1 is all zeros (new branch on the remote), the validated commit range is calculated with `git log <localSha> --not --remotes=<remoteName>`. This strategy targets commits unknown to the named remote without revalidating the entire local history.

### Why

- Native Git hooks sometimes live in a `gitDir` outside the workspace (`.git` text file for worktrees); basing resolution on the Nexkit script location avoids fragile working-directory dependencies.
- The `pre-push` protocol provides no usable remote boundary for a new branch. `--not --remotes=<remoteName>` is the most precise compromise available locally to approximate "commits actually being pushed".

---

## Decision: Ruleset bootstrap orchestration and hook-toggle wiring (Lot 6)

**Date:** 2026-07-08
**Agent:** Link
**Classification:** Project-specific — `ruleset-validation` feature

### Context

Integration of GitHub ruleset validation into the existing startup verification and hook management infrastructure.

### Decisions

1. **Bootstrap interactivity** is proxied through `deployUserLevelSettings`:
   - `verifyOnStartup()` passes `deployUserLevelSettings: false`, so ruleset bootstrap runs silently and never opens the first-time consent popup during VS Code startup.
   - Explicit workspace verification/initialization keeps the default `true`, so the consent popup can appear only during intentional user-triggered flows in V1.

2. **Hook-level toggles** are enforced by extending `GitRulesetHooksDeployer.deployHooks()` with optional `deployCommitMsgHook` and `deployPrePushHook` flags:
   - the bootstrap always persists the compiled policy,
   - only enabled hook wrappers/scripts are deployed,
   - disabled hook wrappers/scripts are actively removed to keep local enforcement aligned with current settings.

### Why

This keeps activation non-intrusive while still allowing explicit consent during deliberate setup flows, matching the startup-verification design already present in Nexkit. Passing hook flags into the deployer is the most coherent place to honor per-hook settings because both hook types consume the same compiled policy but produce different local artifacts.
