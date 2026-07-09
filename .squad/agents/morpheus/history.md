# Morpheus — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension that manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories. Handles workspace initialization, MCP server configuration, and automated extension self-updates.

**Stack:** TypeScript 5.x (strict), VS Code Extension API 1.105.0+, Preact (webview sidebar), esbuild (bundling), Mocha + Sinon (testing), semantic-release + Conventional Commits.

**Owner:** Eric Decarufel

**Architecture:** Service-oriented with dependency injection via `ServiceContainer`. All services instantiated in `src/core/serviceContainer.ts`.

**Key contact for approval:** Eric De Carufel (provides clarifications, approves architecture decisions)

## Learnings

### GitHub Ruleset Validation Feature

**Key Decisions (2026-07-08):**

1. **Strict Pattern Matching** — When translating GitHub ruleset patterns to local Git hooks, maintain full semantic parity. Any pattern that cannot be strictly evaluated must be marked as unsupported (server-only), not approximated. This ensures local validation never silently accepts commits that GitHub would reject.

2. **Dual-Hook Enforcement** — Branch-name and commit-message rules must run at both `commit-msg` AND `pre-push` Git hooks, not just one. This prevents edge cases where commits created outside VS Code bypass validation.

3. **Explicit Consent UX** — First-time hook activation requires active user approval ("Activer localement" button), not passive/silent acceptance. This respects user autonomy and makes debugging easier if hooks cause issues.

4. **Include Org-Level Rulesets** — Use `includes_parents=true` when reading GitHub rulesets API so organization/enterprise-level rules are captured in V1, not just repo-level rules.

**Architecture Principle:**

- Two-layer design: remote read layer (GitHub REST API) + local enforcement layer (rule translation)
- Keeps GitHub API concerns isolated from hook generation
- Makes unsupported rules explicit rather than overloading the hook deployer
- Read-only sync pattern: user consents once per repo; subsequent refreshes run silently
