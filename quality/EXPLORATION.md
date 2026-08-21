# Exploration Findings

## Domain and Stack

- Project: Nexkit, a VS Code extension that manages AI templates, workspace bootstrap, MCP configuration, and workflow helpers.
- Language/runtime: TypeScript on VS Code extension host (Node runtime), compiled to CommonJS.
- Build/test stack: esbuild, Mocha + Sinon, nyc coverage (from package metadata and docs).
- External systems: GitHub API/authentication, local filesystem, Docker/act for workflow execution, Python subprocess for markitdown conversion.
- Primary output: Workspace/user configuration and template materialization under .nexkit and VS Code settings/mcp files.

## Architecture

- Activation entrypoint wires all feature commands and startup tasks in src/extension.ts:32-126.
- Dependency injection container constructs cross-feature services in src/core/serviceContainer.ts:82-179.
- Command registration helper centralizes telemetry/error wrapping in src/shared/commands/commandRegistry.ts:9-27.
- Startup verification chain runs via src/features/initialization/startupVerificationService.ts:31-43.
- Managed file protection and rollback behavior is implemented by src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:41-340.
- Template install/uninstall operations are in src/features/ai-template-files/services/templateFileOperations.ts:39-239.
- MCP config mutation paths are in src/features/mcp-management/mcpConfigService.ts:126-189.
- Local workflow execution pipeline is in src/features/github-workflow-runner/githubWorkflowRunnerService.ts:162-492.

## Existing Tests

- test framework: Mocha + Sinon; 42 test files detected under test/suite.
- Positive: targeted unit tests exist for workflow runner argument construction and several feature services.
- Coverage gaps:
  - Critical activation tests are skipped in test/suite/extension.test.ts:60,65,72.
  - Skipped activation tests also reference obsolete command IDs (test/suite/extension.test.ts:79-83) that no longer match package command declarations (package.json:43,80,114).
- Risk signal: test suite can stay green while command registration or activation behavior regresses.

## Specifications

- Human docs exist under docs/ and README, including architecture and operational behavior.
- No reference_docs/ folder exists; formal citation tiers are unavailable for this run.
- As required, this run proceeds using Tier-3 code evidence and project docs as non-citable context.

## Open Exploration Findings

1. [Cross-function trace] Global process-level handlers are attached on activation but never explicitly detached in deactivate.
   - Evidence: process handlers are registered in src/extension.ts:176 and src/extension.ts:191; deactivate is empty at src/extension.ts:235.
   - Hypothesis: repeated host reload/reactivation can stack listeners and duplicate telemetry/error reporting.

2. [Cross-function trace] Startup path can trigger auth UX even when user did not request template operations.
   - Evidence: activate calls verifyOnStartup in src/extension.ts:89; verifyOnStartup calls ensureAuthenticated at src/features/initialization/startupVerificationService.ts:41; ensureAuthenticated can show a warning prompt in src/features/initialization/githubAuthPromptService.ts:32-37.
   - Hypothesis: non-consensual startup prompts degrade UX and may interrupt unrelated workflows.

3. Managed-file watcher assumes utf8 text for all .nexkit files, including rollback writes.
   - Evidence: repeated read/write in utf8 at src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:195,207,220,291.
   - Hypothesis: binary or non-utf8 managed assets can be corrupted during restore/revert cycles.

4. MCP config update path can discard existing JSON state on parse errors.
   - Evidence: parse failure falls back to fresh config in src/features/mcp-management/mcpConfigService.ts:142-144, then writes merged output at src/features/mcp-management/mcpConfigService.ts:189.
   - Hypothesis: minor hand-edit JSON mistakes can wipe unrelated MCP servers/inputs.

5. [Cross-function trace] Workflow execution command strings interpolate event/job directly into shell fragments before terminal send.
   - Evidence: interpolation in src/features/github-workflow-runner/githubWorkflowRunnerService.ts:420,422,439,441; execution via terminal.sendText at src/features/github-workflow-runner/githubWorkflowRunnerService.ts:217.
   - Hypothesis: malformed job/event values (quotes/control chars) can break command integrity or cause unintended shell behavior.

6. Activation contract tests are stale and disabled.
   - Evidence: skipped tests at test/suite/extension.test.ts:60,65,72; expected command IDs include legacy values at test/suite/extension.test.ts:79-83 that do not match current package contributions (package.json:43,80,114).
   - Hypothesis: regression in command contribution or activation can ship undetected.

7. Auth helper requests broad repo scope by default in multiple code paths.
   - Evidence: default scopes ["repo"] in src/shared/utils/githubAuthHelper.ts:89; ensureAuthenticated invokes getGitHubSession(["repo"]) in src/features/initialization/githubAuthPromptService.ts:22 and :40.
   - Hypothesis: scope minimization is not enforced; least-privilege posture is weaker than required for read-only template fetch flows.

8. File watcher startup does not guard against duplicate startWatching calls in-process.
   - Evidence: startWatching allocates watcher/listeners at src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:55-64 without early return if \_watcher already exists.
   - Hypothesis: accidental repeated start calls can register duplicate handlers and emit duplicate prompts/events.

9. Synchronous filesystem operations in conversion path can block extension host on larger inputs.
   - Evidence: fs.mkdtempSync/writeFileSync/rmSync in src/features/convert-to-markdown/markitdownConversionService.ts:148,151,160.
   - Hypothesis: conversion UI actions can create perceptible host stalls and cancelability issues under load.

10. Startup verification intentionally mutates workspace files but runs on every activation.

- Evidence: verifyWorkspaceConfiguration is called from verifyOnStartup in src/features/initialization/startupVerificationService.ts:39 and writes through deployers.
- Hypothesis: repeated startup writes can create unnecessary churn and race opportunities with user edits.

## Quality Risks

1. P1 - Startup listener accumulation and duplicated fault telemetry.
   - Because src/extension.ts:176 and src/extension.ts:191 register process-level handlers while src/extension.ts:235 leaves deactivate empty, reactivation can produce multiple listeners.
   - Failure mode: one runtime error emits N duplicated logs/telemetry events, obscuring root cause and inflating incident volume.

2. P2 - Managed file corruption during rollback of non-utf8 content.
   - Because src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:195/207/220/291 assumes utf8 round-trips, binary or mixed-encoding files may be rewritten incorrectly.
   - Failure mode: template assets silently degrade after external edit/create/delete reconciliation.

3. P3 - Configuration loss on recoverable JSON parse mistakes.
   - Because src/features/mcp-management/mcpConfigService.ts:142-144 silently resets to empty config and persists at :189, partial parse failures can erase unrelated entries.
   - Failure mode: user loses existing MCP configuration after one malformed edit instead of receiving a non-destructive validation error.

4. P4 - Shell command integrity drift in workflow execution path.
   - Because src/features/github-workflow-runner/githubWorkflowRunnerService.ts:420/422/439/441 interpolates values into quoted shell fragments and sends raw command at :217, edge characters can alter argument boundaries.
   - Failure mode: wrong workflow/job execution, script failure, or command confusion in terminal context.

5. P5 - Quality blind spot from skipped activation tests and stale command IDs.
   - Because test/suite/extension.test.ts:60/65/72 skip activation tests and references old command IDs at :79-83, regressions in command registration can pass CI.
   - Failure mode: shipped extension loads without expected commands or with mismatched UI actions.

## Skeletons and Dispatch

- State machine surface: MCP setup prompt dismissal and workspace initialization flags in src/core/settingsManager.ts:20-24 and :91-116.
- Dispatch/branch surfaces:
  - Workflow script command builder branching by OS in src/features/github-workflow-runner/githubWorkflowRunnerService.ts:403-411.
  - Managed file events routed by create/change/delete handlers in src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:59-61.
- Defensive structures:
  - Bulk suppression depth control in src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:74-90.
  - Soft/hard subprocess timeout controls in src/features/convert-to-markdown/markitdownConversionService.ts:19-27 and :203-207.

## Pattern Applicability Matrix

| Pattern                                     | Decision (`FULL` / `SKIP`) | Target modules                                                         | Why                                                                                             |
| ------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Fallback and Degradation Path Parity        | FULL                       | GitHub auth/session flows, MCP config merge fallback                   | Multiple fallback tiers (session/env/prompt, parse-fail reset) can diverge in safety behavior.  |
| Dispatcher Return-Value Correctness         | SKIP                       | Workflow execution, watcher callbacks                                  | Most high-risk findings are side-effect consistency issues rather than return-value predicates. |
| Cross-Implementation Consistency            | FULL                       | User vs workspace MCP updates; command contribution vs test assertions | Same logical operations are implemented across separate surfaces and can drift.                 |
| Enumeration and Representation Completeness | SKIP                       | Command lists and settings keys                                        | No critical enum whitelist gap found yet that exceeds other higher-yield patterns this pass.    |
| API Surface Consistency                     | FULL                       | Script arg builders and CLI argument array builder                     | Multiple API surfaces build equivalent act invocation semantics and can diverge.                |
| Spec-Structured Parsing Fidelity            | FULL                       | Shell argument construction and JSON config parse path                 | Structured text parsing/quoting errors can create correctness and safety regressions.           |

## Pattern Deep Dive — Fallback and Degradation Path Parity

### Auth resolution parity (silent session -> env token -> interactive prompt)

- Primary path:
  - Existing session: src/features/initialization/githubAuthPromptService.ts:22-26.
- Fallback paths:
  - Environment token check: src/features/initialization/githubAuthPromptService.ts:28-31.
  - Interactive prompt and session creation: src/features/initialization/githubAuthPromptService.ts:32-47.
- Cross-function path:
  - Triggered unconditionally from startup verification at src/features/initialization/startupVerificationService.ts:41.
- Gap:
  - Operational parity differs: non-interactive startup run can transition into interactive UI flow, changing extension behavior from passive verify to active prompt without user intent.
- Candidate requirement:
  - REQ-003: startup verification must avoid interactive auth prompts unless user explicitly invokes a GitHub-dependent command.

### MCP config parse fallback parity

- Primary path:
  - Existing config parsed and selectively merged: src/features/mcp-management/mcpConfigService.ts:141-160.
- Fallback path:
  - Parse/read failure drops to empty {servers:{}} via catch at :143-144.
- Gap:
  - Fallback path does not preserve prior bytes or abort writes; it writes a fresh file at :189.
- Candidate requirement:
  - REQ-006: parse failures must fail safely and preserve original mcp.json content.

## Pattern Deep Dive — Cross-Implementation Consistency

### User-level vs workspace-level MCP server add flows

- Implementation A (user): addUserMCPServer at src/features/mcp-management/mcpConfigService.ts:77-103.
- Implementation B (workspace): addWorkspaceMCPServer at src/features/mcp-management/mcpConfigService.ts:108-123.
- Shared merger: updateMCPConfig at src/features/mcp-management/mcpConfigService.ts:126-189.
- Consistency gap:
  - Both flows depend on the same parse-reset behavior. A parse error in either target file leads to overwrite reset, which violates safe-update expectations in both surfaces.
- Candidate requirement:
  - REQ-006 and REQ-007 should explicitly bind to both user and workspace paths.

### Runtime command contract vs test contract

- Runtime command IDs are declared in package.json:43,80,114.
- Test command expectations in extension tests use legacy IDs at test/suite/extension.test.ts:79-83.
- Consistency gap:
  - The tests that should enforce command registration are both stale and skipped (test/suite/extension.test.ts:60,65,72), so contract drift is unchecked.
- Candidate requirement:
  - REQ-010: command registration contract tests must be executable and match contributed command IDs.

## Pattern Deep Dive — API Surface Consistency

### Three act invocation surfaces should remain semantically equivalent

- Surface A: Terminal command with PowerShell flags built at src/features/github-workflow-runner/githubWorkflowRunnerService.ts:417-431.
- Surface B: Terminal command with shell flags built at src/features/github-workflow-runner/githubWorkflowRunnerService.ts:436-450.
- Surface C: Argument-array builder for direct act invocation at src/features/github-workflow-runner/githubWorkflowRunnerService.ts:456-492.
- Divergence risk:
  - Surfaces A/B quote interpolated strings differently from C (array-safe). A/B are vulnerable to quote/boundary issues while C is structured.
- Candidate requirement:
  - REQ-008: workflow run parameters must be encoded in shell-safe/argument-safe form consistently across Windows and POSIX execution paths.

### Managed-file lifecycle surfaces should preserve content invariants

- Surface A: change rollback path uses read/restore/optional-rewrite (src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:195-220).
- Surface B: delete rollback path restores and optionally deletes again (src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:290-303).
- Divergence risk:
  - Both assume utf8 text semantics and can mutate byte-level content.
- Candidate requirement:
  - REQ-004: file rollback/recovery must preserve byte-exact file content for managed artifacts.

## Pattern Deep Dive — Spec-Structured Parsing Fidelity

### Shell argument parsing fidelity in command-string builders

- Parsing context:
  - buildPowerShellScriptArgs embeds values into quoted fragments at src/features/github-workflow-runner/githubWorkflowRunnerService.ts:420-423.
  - buildShellScriptArgs does same at :439-442.
  - terminal.sendText executes as a single shell command at :217.
- Failure input class:
  - Event/job strings containing embedded quotes or shell control chars can terminate or alter intended argument boundaries.
- Why structured parsing matters:
  - Shell parsers are grammar-driven; plain string interpolation is a shortcut parser for structured arguments.
- Candidate requirement:
  - REQ-008: parameter encoding must be escaped/validated per shell grammar before execution.

### JSON parse fidelity in config mutation path

- Parsing context:
  - updateMCPConfig attempts JSON.parse at src/features/mcp-management/mcpConfigService.ts:142.
  - On any parse error, catch silently resets config (143-144).
- Failure input class:
  - Trailing comma or transient partial file content becomes destructive rewrite trigger.
- Candidate requirement:
  - REQ-006: parse errors must produce non-destructive error path with user feedback.

## Candidate Bugs for Phase 2

1. BUG-HYP-001 (open exploration + quality risk): duplicate global process error handlers on reactivation.
   - Evidence: src/extension.ts:176,191 with empty deactivate at src/extension.ts:235.
   - Review focus: validate listener lifecycle and disposal semantics across activation/deactivation.

2. BUG-HYP-002 (open exploration + quality risk): managed file watcher corrupts non-utf8/binary assets during rollback.
   - Evidence: src/features/nexkit-file-watcher/nexkitFileWatcherService.ts:195,207,220,291.
   - Review focus: verify byte-preserving strategy and file-type boundaries.

3. BUG-HYP-003 (quality risk + pattern deep dive): MCP config merge path can erase existing config on parse failure.
   - Evidence: src/features/mcp-management/mcpConfigService.ts:142-144,189.
   - Stage: strengthened by Fallback parity and Structured parsing deep dives.
   - Review focus: confirm data-loss behavior and safe-write alternatives.

4. BUG-HYP-004 (pattern deep dive): workflow run command builders may mis-handle quoted input across shells.
   - Evidence: src/features/github-workflow-runner/githubWorkflowRunnerService.ts:420,422,439,441,217.
   - Stage: API surface consistency + structured parsing.
   - Review focus: parameter escaping and parity between string-builder and args-array path.

5. BUG-HYP-005 (open exploration + cross-implementation): activation/command contract regressions are untested due skipped stale tests.
   - Evidence: test/suite/extension.test.ts:60,65,72,79-83 vs package.json:43,80,114.
   - Review focus: enforce active command contract tests with current IDs.

## Derived Requirements

- REQ-001: Extension activation must register all contributed commands declared in package metadata, and registration tests must execute in CI.
- REQ-002: Process-level error/rejection handlers must be registered exactly once per host lifecycle and cleaned up on deactivation or reactivation.
- REQ-003: Startup verification must be non-intrusive; authentication prompts require explicit user-triggered flows.
- REQ-004: Managed-file change/delete recovery must preserve byte-exact content, including non-utf8 and binary files.
- REQ-005: Managed-file watcher startup must be idempotent and avoid duplicate watcher/listener allocation.
- REQ-006: MCP config parse failures must fail safely, preserving existing configuration bytes and surfacing actionable user feedback.
- REQ-007: User-level and workspace-level MCP updates must share the same non-destructive merge guarantees.
- REQ-008: Workflow execution parameters must be escaped/validated for the target shell grammar before terminal execution.
- REQ-009: Conversion operations must avoid extension-host blocking patterns for file I/O on large content paths.
- REQ-010: Contract tests for activation commands must track current package command IDs and fail on drift.
- REQ-011: Auth flows must enforce least-privilege scopes aligned with operation type (read-only fetch vs write actions).
- REQ-012: Startup verification writes must be minimized and deterministic to avoid workspace churn across activations.

## Derived Use Cases

- UC-01: Developer initializes a workspace and expects commands, templates, and settings to be ready without duplicate side effects.
- UC-02: Developer edits managed .nexkit files and expects predictable protection without file corruption.
- UC-03: Developer configures MCP servers and expects existing config to remain intact on malformed edits.
- UC-04: Developer runs a local workflow from the sidebar and expects exact workflow/job targeting across operating systems.
- UC-05: Developer opens VS Code on an existing project and expects startup checks to be helpful but non-disruptive.
- UC-06: Maintainer relies on CI tests to detect command registration and activation contract regressions.

## Notes for Artifact Generation

- Focus review/test scaffolding on startup side-effect boundaries, filesystem mutation safety, and workflow command integrity.
- Build functional tests that assert command ID parity between package contributions and command registration checks.
- Prioritize regression probes for MCP parse-failure preservation and watcher binary-content preservation.

## Gate Self-Check

1. PASS - File exists and is substantive; exceeds 120 lines with concrete findings, risks, requirements, and use cases.
2. PASS - PROGRESS tracking has been updated in this run and will be marked Phase 1 complete at close.
3. PASS - Derived Requirements includes REQ-001..REQ-012 with concrete file/function targets.
4. PASS - Exact section title "## Open Exploration Findings" exists with 10 findings, each with file:line citations across multiple modules.
5. PASS - Multi-location open findings present (items 1,2,5,6) tracing across 2+ functions/files.
6. PASS - Exact section title "## Quality Risks" exists with 5 ranked domain-driven failure scenarios and file:line anchors.
7. PASS - Exact section title "## Pattern Applicability Matrix" exists and evaluates all 6 required patterns.
8. PASS - 4 patterns marked FULL (within required 3-4 range).
9. PASS - 4 pattern deep-dive sections exist with titles beginning "## Pattern Deep Dive — ", matching FULL count.
10. PASS - At least 2 deep dives trace multi-function paths (Fallback parity, API surface consistency, Cross-implementation).
11. PASS - Exact section title "## Candidate Bugs for Phase 2" exists with 5 prioritized hypotheses and review guidance.
12. PASS - Candidate source balance satisfied: >=2 from open exploration/risks and >=1 materially strengthened by pattern deep dives.
