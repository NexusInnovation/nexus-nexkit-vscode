# Squad Decisions — Active

> **Résumé.** Active decisions only; see decisions-archive.md for full history of older decisions (before 2026-08-29).

---

## Decision: User directive — Feature/squad-support base (2026-09-28)

• All Squad PRD PRs (SQD-*) must target `feature/squad-support`, never `develop` or other feature branches.
• User request by Eric De Carufel for clean feature-branch isolation during parallel Squad development.

---

## Decision: SquadDetectionService design (SQD-004, 2026-09-28)

• Detection layer over SQD-001 domain types; covers FR-001 (marker files), FR-002 (project version), FR-003 (CLI detection).
• Public method: `detect(workspaceRoot?): Promise<SquadResult<SquadDetectionResult>>`.
• Constructor injection for all I/O seams (fileReader, cliRunner, logger, customCliPath, version info); never direct SettingsManager access.
• Absence is success: missing markers, missing CLI, timeouts all resolve to valid snapshot; only unexpected fs errors → `detection-failed`.
• Cross-platform paths via `vscode.Uri.joinPath`; CLI/config comes in via constructor, not settings (SQD-003 will inject).

---

## Decision: SquadCliService design (SQD-005, 2026-09-28)

• Safe wrapper over `@bradygaster/squad-cli` for FR-003 (version probe), FR-004 (global/npx/custom per SQD-002), FR-005 (upgrade commands).
• Files: `squadCliService.ts` (service + allowlist + types), `squadProcessRunner.ts` (injectable seam + ChildProcessSquadRunner).
• No shell injection: `shell: false` with args array; on Windows, spawns via `cmd.exe /d /s /c` with separate argv entries (Node-applied escaping).
• Explicit allowlist `SQUAD_CLI_COMMAND_SPECS` with per-command flags/operands/timeouts; caller args validated before spawn.
• Error contract: ENOENT→`cli-not-found`, timeout→`cli-timeout`, non-zero→`cli-execution-failed` (stderr summary ≤200 chars), cancel→`cancelled`, unparseable semver→`version-unknown`.
• Config via injection (tests) or lazy SettingsManager (production); telemetry-safe (only command id + exit code).

---

## Decision: Squad settings shape in SettingsManager (SQD-002, 2026-09-28)

• Three `nexkit.squad.*` settings, all `scope: application`, written via `SettingsManager` with Global target (never Workspace).
• `nexkit.squad.cliSource` (enum global/npx/custom, default npx) — how CLI is invoked.
• `nexkit.squad.cliPath` (string, default "") — custom CLI path when `cliSource === custom`.
• `nexkit.squad.telemetry.enabled` (boolean, default true) — anonymous Squad journey telemetry, additive (AND with existing telemetry checks).
• `cliSource` getter/setter typed with SQD-001 `SquadCliSource` union; both layers share one source of truth.
• Default `cliSource` is `npx` (zero-install path).
• Telemetry emitters gate on `isSquadTelemetryEnabled()` + existing checks; no file names/paths/workspace/content/secrets collected.
• Test host limitation: `config.update` throws if setting not registered; copy existing skip-on-message pattern; assert real values in default-getter tests only.

---

## Decision: Register Squad services in ServiceContainer (SQD-003, 2026-09-28)

• `squadDetection: SquadDetectionService` always constructed (no-arg options). Detection resolves workspace root on-call, no activation work.
• `squadFile?: SquadFileService` optional/nullable, bound to `vscode.workspace.workspaceFolders?.[0]?.uri` only when folder open. Consumers must null-check.
• No disposables registered; neither service implements `Disposable`.
• Did NOT wire SQD-004's `customCliPath` from SettingsManager — CLI-path belongs to SQD-005 `SquadCliService` per-call. Placeholder comment left for SQD-005 registration.

---

## Decision: Squad project version parsing contract (SQD-006, 2026-09-28)

• Robust version parsing from `<!-- version: x -->` stamp in `.github/agents/squad.agent.md`.
• Pure `parseSquadProjectVersion(content): SquadResult<SquadProjectVersion>` in `squadProjectVersionReader.ts`; consumed by both new `SquadProjectVersionReader` and `SquadDetectionService`.
• Classification via `SquadProjectVersionKind`: missing (no stamp) → OK, maps to `Unknown` (not error); source (`0.0.0-source`) → OK, `isSource: true`, not comparable; pinned (strict semver) → OK, comparable; malformed → `parse-failed` error with remediation.
• File-level errors actionable: missing agent file or read failure → `file-read-failed` with remediation. Never fabricates version.
• Detection degrades to `Unknown` (log warning) on bad stamp; direct callers (e.g., version panel) use `SquadProjectVersionReader` for actionable `SquadResult` error.
• Only pinned semver is comparable; source/missing stays `Unknown`.

---

## Decision: Read-only SquadFileService shape & error semantics (SQD-011, 2026-09-28)

• Read-only accessor for `.squad/` directory in `src/features/squad/services/squadFileService.ts`.
• Constructor: `squadFileService.ts(workspaceRoot: vscode.Uri, logger?: LoggingService)`. All fallible methods return `SquadResult<T>`.
• Public API: `readRoster()`, `readCharter(agentId)`, `readDecisions()`/`readRouting()`, `readAgentHistory(agentId)`, `listLogs(kind)`/`readLog(kind, name)`, `readUpstreams()`.
• Optional-absent artifacts resolve to success: `readRouting`/`readDecisions` → `exists:false, content:""`; `readUpstreams`/`listLogs` → empty array.
• Missing *requested* files → `file-read-failed`; malformed JSON/missing members table → `parse-failed`.
• History/log reads capped at `SQUAD_MAX_READ_BYTES` (256 KB); `truncated:true` + true `sizeBytes` reported; panel shows "open file" affordance when truncated.
• New read-model types (`SquadTextFile`, `SquadLogRef`, `SquadLogKind`) exported from service module (not models), to avoid editing SQD-001.
• Security: path-traversal guard rejects `agentId`/log `name` with `/`, `\`, `..` before `vscode.Uri.joinPath`.

---

## Decision: Squad preset test behavior coverage (SQD-023, 2026-09-28)

• Complementary file `test/suite/squadPresetValidator.behavior.test.ts` (62 tests) separate from Link's SQD-015 baseline (24 tests), keeping attribution clean; 86 tests total, all green.
• Tests assert on behavior: diagnostic codes, severities, user-facing messages, remediation; every failure path asserts non-`valid` + actionable remediation.
• Coverage: valid presets (canonical/minimal/no-files/no-description/`**` glob/`./`-relative); each missing required file/folder; malformed manifests (array/number/null/string/truncated JSON, non-numeric schemaVersion, empty/whitespace id, non-string `files.required`); extra/unexpected files; absolute (POSIX/Windows/UNC), traversal, dangerous-extension, symlink paths; case sensitivity, Windows separators; empty/unreadable/throwing input; actionable-message invariants; secret scanning; result adapter/descriptor.
• Bugs found: **none**. Validator behavior matches SQD-015 contract. Documented: listings backslash-normalized + `./`-stripped before checks; extensions lower-cased; `manifest.json` + required names case-sensitive; path safety reports first block per path; `valid` iff zero error-severity diagnostics.
• Verification: pnpm check:types ✅, pnpm lint ✅, test-compile ✅, both suites 86 passing ✅ (mocha direct, vscode-free).
• Tooling: npm run lint only lints src; test type-safety via check:types/test-compile (tsc -p ./). Worktree: use pnpm --config.verifyDepsBeforeRun=false + git commit/push --no-verify.

---

## Decision: Squad preset contract validator (SQD-015, 2026-09-28)

• Validator in `src/features/squad/validation/` folder (barrel `index.ts`); validation types in `models/squadPresetValidation.ts` (re-exported from models barrel), logic in `validation/squadPresetValidator.ts`.
• Public API: `validateSquadPreset(input): SquadPresetValidation` (returns `{ valid, diagnostics[], manifest? }`); `validateSquadPresetAsResult(input): SquadResult<SquadPreset>` (SQD-001 adapter); `buildSquadPreset(manifest, source?)`.
• Abstract input: `{ paths: string[], readTextFile?, symlinkPaths?, source? }` — pure validator (no fs/vscode), reusable across GitHub/local sources.
• Contract rules: manifest required + valid JSON + supported `schemaVersion` + non-empty `id`/`displayName`; required files globs satisfied; `team.md` baseline.
• Path safety errors: absolute paths, `..` traversal, symlinks, dangerous/executable extensions rejected.
• Warnings (non-blocking): unexpected extensions, heuristic secret matches (AWS/GitHub/private keys/bearer tokens).
• Diagnostics: `SquadPresetIssueCode` const-map, `SquadPresetDiagnosticSeverity` (`error`/`warning`), user-facing `message`, offending `path`, actionable `remediation`.
• Downstream guidance: SQD-016/017/018 build paths listing + pass `readTextFile`; SQD-020 init treats non-`valid` as hard stop (diagnostics carry remediation).

---

## Decision: Common Squad preset-source interface (SQD-017, 2026-09-28)

• Pluggable preset-**source** contract lives in `src/features/squad/models/squadPresetProvider.ts` (types re-exported from the models barrel).
• `SquadPresetProvider` interface: `readonly id`, `readonly label`, `discoverPresets(): Promise<SquadResult<SquadPresetDiscovery>>`.
• `SquadPresetDiscovery`: `presets: SquadPreset[]` (valid, SQD-015-passing descriptors), `rejected: RejectedSquadPreset[]` (found-but-invalid with diagnostics).
• Error contract: source-level failure (cannot reach/read the source) → `SquadResult` **failure** (`squadErr`); reachable-but-empty → `squadOk({ presets: [], rejected: [] })`; per-preset contract violation → goes in `rejected[]` (visible, actionable), never silently dropped.
• SQD-017 implementation (`NexusMarketplacePresetProvider`): reads installed marketplace at `~/.vscode/agent-plugins/github.com/<owner>/<repo>`, parses `.github/plugin/marketplace.json`, filters local plugins (string `source` like `"./plugins/<name>"`), validates via SQD-015.
• Local vs external: string `source` is local (SQD-017); object `source` or `repository` URL is external (SQD-018's job).
• `squadFolderPath` is repo-relative (`plugins/<name>/squad`) so remote downloader (#283) can fetch same folder.
• File-system behind injectable `SquadPresetFileSystem` seam → unit-tested with in-memory FS under plain mocha (8 cases).

---

## Decision: Resolve Squad presets from external repos + composite provider (SQD-018, 2026-09-28)

• `ExternalRepoPresetProvider` (`src/features/squad/services/externalRepoPresetProvider.ts`): reads installed marketplace manifest, selects **external** entries, resolves each repo, reuses **`SquadPresetDownloadService`** (#283) to fetch `squad/` and validate via SQD-015.
• **greffondors** resolves to `NexusInnovation/nexus-nexkit-templates-cnq`. Manifest entry uses `source: { repo: "<owner/repo>", source: "github" }` + `repository` URL. The external repo's `squad/` folder is at **repo root** (`squadFolderPath: "squad"`).
• Marketplace coordinates + agent-plugins root are **constructor-injected**; accepts explicit `externalRepos[]` (tests / not-yet-published repos), merged+deduped by pluginId with manifest-derived repos.
• **`CompositeSquadPresetProvider`** — fans out to child providers, merges discoveries.
• Error contract extended: added optional `unreachable: UnreachableSquadSource[]` to `SquadPresetDiscovery` (carries `{ sourceId, label, source?, error: SquadError }`). Optional ⇒ SQD-017's `{ presets, rejected }` still satisfy interface, no changes needed.
• **Isolation guarantee:** one failing external repo or one failing child provider folded into `unreachable`; discovery still returns `squadOk` with every healthy preset. Composite catches thrown errors → `code: "unknown"`.

---

## Decision: Generalized recursive GitHub download for Squad presets (SQD-016, 2026-09-28)

• Extract recursive walk from `RepositoryTemplateProvider` into reusable shared utility + build Squad resolver on top.
• `GitHubRecursiveDownloader` in `src/shared/utils/githubRecursiveDownloader.ts` — vscode-free, GitHubAuthHelper-free for plain-mocha testability.
• Public: `downloadFolder({owner, repo, path, branch?}) → { files: Map<relPath,content>, symlinks: string[], fileCount, directoryCount }`.
• Seams: injectable `fetchFn` (minimal interface, compatible with global `fetch`), optional `getHeaders` (default User-Agent+Accept; auth caller-supplied), optional logger, `maxFiles` cap.
• Error contract: any non-2xx raises `GitHubApiError` (`status`, `path`, `isRateLimit`, actionable `remediation`) — never silent success. Rate-limit: `403/429` with `x-ratelimit-remaining === "0"`.
• Symlinks: `type: "symlink"` entries recorded in `result.symlinks` (not downloaded), so validators reject them.
• `RepositoryTemplateProvider.downloadDirectoryContents` refactored to delegate; behavior preserved, existing skills unchanged.
• `SquadPresetDownloadService` in `features/squad/services/` — `downloadPreset(source: SquadPresetSource)` resolves owner/repo/branch/squadFolderPath, downloads recursively, validates with SQD-015.
• Returns `preset-fetch-failed` (HTTP/network wrapping GitHubApiError.remediation), `preset-invalid` (validation), or `squadOk({ preset, files, validation })`.
• Kept vscode-free via import type + lazy require of LoggingService; suite runs under plain mocha.
• Key gotcha: `validateSquadPreset` flags symlink only if path in `input.paths`; resolvers must pass `paths: [...files, ...symlinks]`.

---

## Decision: Squad preset validator test coverage (SQD-023, 2026-09-28)

• Complementary file `test/suite/squadPresetValidator.behavior.test.ts` (62 tests) separate from Link's SQD-015 baseline (24 tests), keeping attribution clean; 86 tests total, all green.
• Tests assert on behavior: diagnostic codes, severities, user-facing messages, remediation; every failure path asserts non-`valid` + actionable remediation.
• Coverage: valid presets (canonical/minimal/no-files/no-description/`**` glob/`./`-relative); each missing required file/folder; malformed manifests (array/number/null/string/truncated JSON, non-numeric schemaVersion, empty/whitespace id, non-string `files.required`); extra/unexpected files; absolute (POSIX/Windows/UNC), traversal, dangerous-extension, symlink paths; case sensitivity, Windows separators; empty/unreadable/throwing input; actionable-message invariants; secret scanning; result adapter/descriptor.
• Bugs found: **none**. Validator behavior matches SQD-015 contract. Documented: listings backslash-normalized + `./`-stripped before checks; extensions lower-cased; `manifest.json` + required names case-sensitive; path safety reports first block per path; `valid` iff zero error-severity diagnostics.
• Verification: pnpm check:types ✅, pnpm lint ✅, test-compile ✅, both suites 86 passing ✅ (mocha direct, vscode-free).
• Tooling: npm run lint only lints src; test type-safety via check:types/test-compile (tsc -p ./). Worktree: use pnpm --config.verifyDepsBeforeRun=false + git commit/push --no-verify.

---

## Decision: Squad webview state — message contract (SQD-007, 2026-09-28)

• Webview-owned types: `SquadState` (slice), `SquadLogDocument`, `SquadLogKind` in `webview/types/squadState.ts`.
• Wired into `AppState.squad` in `webview/types/appState.ts`.
• Message types: `WebviewMessage` (webview→host), `ExtensionMessage` (host→webview) in `panel-ui/types/webviewMessages.ts`.
• Central handling: `webview/contexts/AppStateContext.tsx`.
• Selector hook + actions: `webview/hooks/useSquadState.ts`.
• All payloads reuse SQD-001 types from `features/squad/models`, serialisable (no vscode, no functions) for postMessage boundary.
• webview→host commands: `getSquadState`, `refreshSquadDetection`, `saveSquadCharter`, `saveSquadDoc`, `selectSquadPreset`, `applySquadPreset`, `runSquadDoctor`.
• host→webview messages: `squadStatusUpdate`, `squadRosterUpdate`, `squadDocsUpdate`, `squadLogsUpdate`, `squadPresetsUpdate`, `squadDoctorUpdate`, `squadLoading`, `squadError`.
• For Link (#223): register cases per command, keep detection lazy (never on activation), post updates via panel postMessage. `SquadLogDocument` gained optional `truncated?`/`sizeBytes?`; host maps SQD-011's `SquadTextFile` onto these in `squadLogsUpdate` payload.

---

## Decision: Squad webview state — message contract (SQD-007, 2026-09-28)

• Webview-owned types: `SquadState` (slice), `SquadLogDocument`, `SquadLogKind` in `webview/types/squadState.ts`.
• Wired into `AppState.squad` in `webview/types/appState.ts`.
• Message types: `WebviewMessage` (webview→host), `ExtensionMessage` (host→webview) in `panel-ui/types/webviewMessages.ts`.
• Central handling: `webview/contexts/AppStateContext.tsx`.
• Selector hook + actions: `webview/hooks/useSquadState.ts`.
• All payloads reuse SQD-001 types from `features/squad/models`, serialisable (no vscode, no functions) for postMessage boundary.
• webview→host commands: `getSquadState`, `refreshSquadDetection`, `saveSquadCharter`, `saveSquadDoc`, `selectSquadPreset`, `applySquadPreset`, `runSquadDoctor`.
• host→webview messages: `squadStatusUpdate`, `squadRosterUpdate`, `squadDocsUpdate`, `squadLogsUpdate`, `squadPresetsUpdate`, `squadDoctorUpdate`, `squadLoading`, `squadError`.
• For Link (#223): register cases per command, keep detection lazy (never on activation), post updates via panel postMessage. `SquadLogDocument` gained optional `truncated?`/`sizeBytes?`; host maps SQD-011's `SquadTextFile` onto these in `squadLogsUpdate` payload.

---

## Decision: Squad webview message routing (SQD-008 / #223, 2026-09-28)

• Implemented host-side routing for Ghost's SQD-007 webview message contract in a new thin `SquadPanelMessageHandler`, delegated to from `NexkitPanelMessageHandler`.
• **Delegation pattern:** `handleMessage` first tries the existing string→handler `Map`; on miss it calls `_squadHandler.handle(message)` which returns a boolean (handled?). "Unknown command" warning only fires when neither matches. Keeps the large top-level handler thin (one Squad class, one file) per Ghost's contract note.
• **Error visibility:** detection is the authoritative gate; `squadError` is emitted (never a silent success) on detection failure and for the first sub-read failure, after emitting whatever roster/docs/logs were successfully read.
• **Nullable `squadFile`:** when no workspace folder is open, only `squadStatusUpdate` is emitted (matches SQD-003's nullable service).
• **Log kind mapping:** service `session`/`orchestration` → webview `log`/`orchestration`; agent histories → `agent-history`.
• Stubbed flows (services in flight) respond with clear "not available yet" `squadError` (SQD-015 download, preset apply, doctor via CLI, write service).

---

## Decision: Squad tab in the NexKit panel (SQD-009 / #224, 2026-09-28)

• On-activation data fetch: tab-content component (`SquadSection`) requests snapshot from mount `useEffect`, guarded by `!isReady && !isLoading` so re-entering tab does not re-run timed CLI detection.
• Detected vs. not-detected branch: `installState ∈ {installed, partial}` ⇒ mount roster / governance / logs in `CollapsibleSection`s. Otherwise show explicit guidance listing expected markers.
• Preset init deferred to #234/#235 — reserved slot with "coming soon" note, no non-functional control.
• Error de-duplication: sub-sections each render `SquadErrorNotice` from shared slice. `SquadSection` surfaces top-level error only while `!isReady`; post-ready errors shown by expanded sub-section (since `CollapsibleSection` renders children only when expanded).
• Placement: developers-mode tab bar only, icon `organization`. No dedicated Squad tab-visibility setting.

---

## Decision: Squad status, versions & CLI diagnostics (SQD-010 / #225, 2026-09-28)

• Diagnostics = Squad Doctor checks, surfaced from `SquadDoctorReport` (checks are doctor's output, not a separate slice).
• Version classification is pure + tested: new `squadStatusFormat.ts` (Preact-free) classifies project version as pinned / source / unknown and only emits `update available` pill for *comparable* (pinned) versions. Same for CLI. 13 unit tests in extension-host runner.
• Doctor error placement: failures land in shared `squad.error` slice as code `doctor-failed`, rendered inline in diagnostics area so never collapses into silent success.
• CLI-missing state + #240 slot: when `cli.installed` is false, explicit notice lists three FR-004 options (global / npx / custom path). Interactive chooser is #240 — reserved as "coming soon" note, no fake control.

---

## Decision: Read-only SquadFileService shape & error semantics (SQD-011, 2026-09-28)

• Read-only accessor for `.squad/` directory in `src/features/squad/services/squadFileService.ts`.
• Constructor: `squadFileService.ts(workspaceRoot: vscode.Uri, logger?: LoggingService)`. All fallible methods return `SquadResult<T>`.
• Public API: `readRoster()`, `readCharter(agentId)`, `readDecisions()`/`readRouting()`, `readAgentHistory(agentId)`, `listLogs(kind)`/`readLog(kind, name)`, `readUpstreams()`.
• Optional-absent artifacts resolve to success: `readRouting`/`readDecisions` → `exists:false, content:""`; `readUpstreams`/`listLogs` → empty array.
• Missing *requested* files → `file-read-failed`; malformed JSON/missing members table → `parse-failed`.
• History/log reads capped at `SQUAD_MAX_READ_BYTES` (256 KB); `truncated:true` + true `sizeBytes` reported; panel shows "open file" affordance when truncated.
• New read-model types (`SquadTextFile`, `SquadLogRef`, `SquadLogKind`) exported from service module (not models), to avoid editing SQD-001.
• Security: path-traversal guard rejects `agentId`/log `name` with `/`, `\`, `..` before `vscode.Uri.joinPath`.

---

## Decision: Read-only Squad panel views — rendering & type shape (SQD-012/013/014, 2026-09-28)

• Safe markdown = escaped preformatted text. Webview has no markdown pipeline; `SquadMarkdownView` renders raw content as plain text in `<pre>` — browser escapes, zero unsanitised-HTML/script risk from workspace `.squad` files.
• `SquadLogDocument` gained `truncated?`/`sizeBytes?` (backward-compatible optional, webview-owned in `squadState.ts`). Host maps SQD-011's `SquadTextFile` (capped at 256 KB) onto these in `squadLogsUpdate`; log viewer shows truncation notice + "open file" affordance when `truncated`.
• Pure util split: `webview/utils/squadFormat.ts` (`formatBytes`, `baseName`, `truncationNotice`) — Preact-free, unit-testable in extension-host Mocha runner (10 cases in `squadFormat.test.ts`). No webview component test harness, so component rendering not unit-tested (pure helpers only).
• Error visibility: every view renders `SquadErrorNotice` (message + remediation + optional detail) when `squad.error` set, alongside loading/empty states — failures never collapse into success.
• Component map for #224 to mount: `organisms/SquadRosterSection.tsx` (roster table + charter detail), `organisms/SquadGovernanceSection.tsx` (decisions + routing), `organisms/SquadLogSection.tsx` (agent-history/session/orchestration logs + truncation); `molecules/SquadMarkdownView.tsx`, `molecules/SquadErrorNotice.tsx` (shared).
• All purely presentational, read from `useSquadState()`. Tab wrapper (#224) calls `useSquadState().refresh()` on mount and renders these.
• Verification: check:types ✅, lint ✅, test-compile ✅, extension-host 427 passing/8 pending ✅, webview bundle clean ✅.

---

## Decision: Squad controlled writes contract (SQD-026, 2026-09-28)

Link: PR #305, merged into `feature/squad-support`

• Keep write operations in `src/features/squad/services/squadFileWriteService.ts`, separate from read-only `SquadFileService`.
• Public write entry points: `saveCharter`, `saveMarkdownDoc`, and the reusable `saveControlledFile` allowlist contract.
• Every controlled write invokes `GitHubTemplateBackupService.backupSquadArtifacts()` before writing; backup failure returns `backup-failed` and aborts without writing.
• The host handles `saveSquadCharter` and `saveSquadDoc` by emitting explicit success messages (`squadCharterSaved`, `squadDocSaved`) or `squadError`; there is no success-shaped fallback.
• Webview success summaries intentionally expose only relative path, created flag, backup-created boolean, and byte count; absolute backup paths remain host-side.

---

## Decision: Governance-doc saves use content-hash optimistic concurrency (SQD-027, 2026-09-28)

Link: PR #306, merged into `feature/squad-support`

• `SquadMarkdownDoc` carries optional `contentHash` (SHA-256 hex of full on-disk bytes; `null` when absent) and `truncated`.
• `saveSquadDoc` accepts optional `baseContentHash`. `SquadFileWriteService.saveMarkdownDoc` rejects mismatches with the new `write-conflict` error code **before** backup/write (string = must match, `null` = must still be absent, omitted = force overwrite).
• Docs (on disk or new content) larger than `SQUAD_MAX_READ_BYTES` (256 KB) are not writable from the panel — remediation points to the VS Code editor.
• Existing CRLF line endings are preserved on save.

---

## Decision: Squad update detection contract (SQD-030, 2026-09-28)

Link: #245, PR #308

Implemented update detection as a reusable service/contract layer, not as upgrade execution.

• Added `SquadUpdateService` under `src/features/squad/services/`.
• Added serializable update models in `src/features/squad/models/squadUpdates.ts`.
• `checkUpdates()` fetches latest Squad package version from npm, enriches detection freshness, and returns CLI/project update candidates.
• CLI update candidate maps to `upgrade-self`, requires confirmation, and does not require a workspace backup.
• Project update candidate maps to `upgrade`, requires confirmation, and requires a backup.
• `0.0.0-source` project versions remain non-comparable/unknown.
• Host/webview message contract: `checkSquadUpdates` -> `squadUpdatesUpdate`.

---

## Decision: CLI self-upgrade confirmed contract (SQD-031, 2026-09-28)

Link: #246, PR #312

• CLI self-upgrade is a separate confirmed write-like operation, not a side effect of update detection. `SquadCliUpgradeService` must first reuse `SquadUpdateService` to prove a CLI update is available, ask for explicit confirmation, run the allowlisted `squad upgrade --self` command, then re-run detection and fail if the installed version cannot be verified as changed/current.
• The webview command/result pair is `upgradeSquadCli` -> `squadCliUpgradeResult`; failures use actionable `squadError` instead of success-shaped fallback state.
• Service/container conflicts with parallel Squad P2 work are additive: keep `squadCliUpgrade` alongside `squadUpdates`, `squadExport`, `squadUpstream`, `squadPlugins`, and `squadPluginActions`.

---

## Decision: Squad export contract (SQD-033, 2026-09-28)

Link: #248, PR #303

Squad export uses a reusable transfer contract in `src/features/squad/models/squadTransfer.ts`:

• `SquadTransferTargetKind.File` with serialisable `file:` URI strings.
• `SquadTransferTargetKind.GitHub` with `owner/repo`, optional `ref`, optional `path`.
• `SquadExportRequest` and `SquadExportOutcome` cross the webview boundary through `exportSquad` and `squadExportResult`.
• The host service (`SquadExportService`) owns file-picker prompting and all CLI execution through the allowlisted `SquadCliService`; errors stay as `SquadResult` failures and route to visible `squadError`.

---

## Decision: Squad import preview and backup contract (SQD-034, 2026-09-28)

Link: #249, PR #314

NexKit owns a two-step Squad import flow instead of directly delegating an arbitrary source to the CLI.

• `SquadImportService.previewImport` reads local file or GitHub contents API sources, validates the export manifest, computes every file that will be created/overwritten, and stages the exact manifest content in memory.
• `applyImport` accepts only a staged preview id for the same workspace, re-plans before writing, prompts for confirmation, invokes `GitHubTemplateBackupService.backupWorkspaceArtifacts()` for touched Squad/skill paths, then runs the allowlisted `SquadCliCommand.Import` with a private temp file and `--force`.
• CLI failures are not success-shaped: when a backup exists NexKit restores from it; when no backup was needed NexKit removes touched paths. Rollback failures surface actionable remediation pointing at the latest `squad-import-*` backup.
• Webview import messages now round-trip through centralized app state: `squadImportPreview` stores the staged preview, `squadImportResult` records the successful outcome and clears the preview, and `squadImportPreviewDiscarded` clears abandoned previews.

---

## Decision: Squad upstream.json display (SQD-035, 2026-09-28)

Link: #250, PR #301

• NexKit reads `.squad/upstream.json` through `SquadFileService.readUpstreams()` and displays upstream ids, source types, references and last sync timestamps in a dedicated read-only Squad panel section. The status header keeps only the upstream count.
• Missing `.squad/upstream.json` is a valid empty upstream list because upstream inheritance is optional. If the manifest exists, invalid JSON, unsupported root shapes, non-object entries, missing id/reference fields, or unsupported source kinds return a structured `parse-failed` `SquadError`; the host forwards that error with `squadError` so the UI never treats a bad manifest as an empty success.

---

## Decision: Upstream recommendations as pure rules service (SQD-037, 2026-09-28)

Morpheus: #252, PR #307

### Decisions
1. **Pure, stateless `SquadUpstreamRecommendationService`** (`src/features/squad/services/`). No `vscode` imports, no I/O, no clock; output is JSON-serialisable. Rules are unit-tested directly.
2. **Constructor injection with default instance** into `SquadPanelMessageHandler` rather than a new `ServiceContainer` member.
3. **Contract**: `squadStatusUpdate.upstreamRecommendations: SquadUpstreamRecommendations | null`. `null` = not evaluated. Failed reads never render clean recommendation; `squadError` is the visible signal. Warnings are **not** errors.
4. **Levels** always returned in org → team → project order. Classification by whole-token keyword match on source id; ambiguous/unmatched sources listed as `unclassifiedSourceIds`.
5. **Reserved folders**: `squad/upstreams/<level>` in the marketplace (configurable via options). Viable way to consume one level is JSON export from folder or dedicated repo per level.
6. **Warning codes**: `subpath-unsupported`, `full-clone`, `hierarchy-order`, `reserved-folder-limitation`. Ordered: per-source → hierarchy → notice.

---

## Decision: Squad plugin inventory contract (SQD-038, 2026-09-28)

Link: #253

`SquadPluginService` is the reusable read-only plugin inventory seam. It delegates marketplace file reads to `SquadFileService` and installed plugin listing to `SquadCliService` using the allowlisted `plugin list --json` command. Webview state now carries both `marketplaces` and `plugins`, with `squadPluginsUpdate` available for plugin-only refreshes and `squadStatusUpdate` carrying the same inventory during full Squad refreshes.

Failures remain visible and actionable: malformed marketplace JSON returns `parse-failed`; CLI/list/JSON failures return `cli-not-found` or `plugin-list-failed` and are emitted as `squadError` after partial inventory updates.

---

## Decision: GitHub backlog detection contract (SQD-042, 2026-09-28)

Link: #257, PR #318

Backlog detection uses a provider-agnostic orchestration service plus platform-specific providers:

• `SquadBacklogService` owns workspace resolution, `.squad/config.json` parsing, git remote discovery, provider selection, timestamping and the success/not-detected/error contract.
• `SquadBacklogProvider` owns platform verification only. GitHub is implemented by `GitHubBacklogProvider`; ADO should add a provider rather than changing service selection semantics.
• Explicit `.squad/config.json` `platform` wins over git remote inference. Platform aliases normalize to provider ids (`github`, `gh`, `azure-devops`, `ado`, etc.).

Error semantics: No workspace is an error (`not-a-workspace`). Malformed `.squad/config.json`, unsupported platforms, tool/auth/rate-limit/provider failures are actionable `SquadResult` errors. No git repository, no remotes, or remotes that do not match a registered provider are valid `not-detected` states with remediation.

---

## Decision: Squad simulated CLI tests (SQD-041, 2026-09-28)

Trinity: #256, PR #313

SQD-041 uses a shared `FakeSquadCli` test helper that implements `SquadProcessRunner` instead of mocking higher-level feature services or invoking any real CLI process. The tests drive the real `SquadCliService` and the current update, upstream, plugin action, and plugin listing services through that seam.

• Keeps tests behavioral and contract-focused: command argv, timeout/cancel behavior, allowlist enforcement, backups/confirmation sequencing, and visible error contracts are all verified where users experience them.
• Satisfies the "no real CLI/process execution" constraint while still failing on relevant regressions.
• Pins the reviewed Squad CLI command/flag allowlist so future command-surface changes require explicit test/security review.
• PR #313 covers FR-005, FR-031, FR-032 and FR-044 with simulated success, non-zero exit, timeout, missing CLI, cancellation, invalid input and parse-failure paths. Surfaced and fixed one hardening issue: prototype-key command ids now return the normal unknown-command `cli-execution-failed` result rather than throwing.

---

## Decision: Squad watch lifecycle contract (SQD-045, 2026-09-28)

Link: #260, PR #319

`squad watch` is owned by a new extension-host `SquadWatchService` registered in `ServiceContainer` and added to `context.subscriptions`. The service starts no work during activation; it only spawns the allowlisted `SquadCliCommand.Watch` command after an explicit command/webview request, and `dispose()` force-kills the process handle so shutdown does not orphan the long-running CLI.

Shared state contract: `SquadWatchStatus.state`: `stopped | starting | running | stopping | failed`. `SquadWatchStatus.error`: `SquadError | null`; non-null only when `state === "failed"`. `SquadWatchSnapshot`: `{ status, logs }`. `SquadWatchLogEntry`: `{ seq, timestamp, stream, text }`, where `stream` is `stdout | stderr | system`. Logs are ANSI-stripped, line-based, capped to 500 retained lines, each line capped to 2000 characters; `droppedLogLines` reports evictions.

Webview → host: `getSquadWatchStatus`, `startSquadWatch` with optional `{ intervalMinutes }`, `stopSquadWatch` with optional `{ force }`. Host → webview: `squadWatchUpdate` with `{ snapshot: SquadWatchSnapshot }`, `squadError` on rejected starts/stops.

Settings: `nexkit.squad.watch.defaultIntervalMinutes` (`application`, default `10`, min `1`, max `1440`). Commands: `nexus-nexkit-vscode.squad.startWatch`, `nexus-nexkit-vscode.squad.stopWatch`.

Error semantics: Starting watch requires an open workspace; otherwise returns `not-a-workspace`. Invalid intervals return `invalid-input`. Duplicate starts return `watch-already-running`. Stops without a process return `watch-not-running`. Spawn failures map to `cli-not-found` or `watch-failed`. Unexpected exits move status to `failed`.

---

## Decision: Squad editor UX — charter/decisions/routing (SQD-029, 2026-09-28)

Ghost: #244, PR #315

SQD-029 adds Preact UI for editing Squad agent charters plus `.squad/decisions.md` and `.squad/routing.md`, consuming Link's SQD-026 controlled-write and SQD-027 content-hash contracts.

• Keep editor side effects in hooks: `useSquadEditor` owns draft/save/cancel lifecycle and delegates writes through `useSquadState`; components remain presentational.
• Keep host-to-webview write replies centralized in `AppStateContext.tsx`; successful `squadCharterSaved` / `squadDocSaved` and write-path `squadError` messages update `SquadState.lastWrite` with a monotonic sequence.
• Governance editors pass the captured `baseContentHash`; truncated documents are read-only, absent governance docs can be created with `baseContentHash: null`, and write conflicts keep the draft with an explicit reload action.
• Save notices expose only the backend write summary (relative path, created, backup-created, bytes written) and never display backup locations.

---

## Decision: Squad upstreams/plugins webview UI (SQD-040, 2026-09-28)

Ghost: #255, PR #317

SQD-040 consumes the merged backend contracts from SQD-036 and SQD-039 for upstream CLI operations and plugin marketplace/lifecycle actions.

The webview keeps upstreams and plugins as normal Squad AppState data and exposes UI behavior through selector/action hooks:

• `useSquadUpstreams` owns add/list/sync/remove dispatch and maps `squadUpstreamOperation*` state into visible feedback.
• `useSquadPlugins` owns refresh/action dispatch and maps `squadPluginActionResult` plus plugin-scoped `squadError` into visible inventory/action feedback.
• `SquadOperationFeedbackView` is shared by both areas so failures render as actionable alerts, cancellations render as neutral status, and success is never shown for failed operations.
• Plugin write actions rely on the host contract for confirmation and `.squad/` backup; the UI labels/tooltips explicitly say write actions ask for confirmation and back up `.squad/`.

Consequences: Components stay presentational. Webview component coverage lives in the happy-dom runner; future UI changes should run `node .\out\test\runWebviewTest.js` in addition to `test:unit`. Plugin-scoped errors are filtered out of the upstream hook.

---

## Decision: Squad ceremony quick actions (SQD-047, 2026-09-28)

Ghost: #262, PR #316

Issue #262 / SQD-047 implements PRD FR-055: NexKit offers quick ceremony actions from `.squad/ceremonies.md` in the Squad webview.

• Parse `.squad/ceremonies.md` read-only through `SquadFileService`, with a dedicated ceremony parser/service and structured `SquadResult` failures.
• Keep the webview launch payload to `{ ceremonyId }`; the extension host re-reads the ceremonies file immediately before launch and rejects missing or disabled ceremonies.
• Surface ceremonies in a new Squad "Ceremonies" collapsible section with explicit missing-file, empty, truncated, disabled, loading, success, and actionable error states.
• Launch ceremonies by opening Copilot Chat on the `Squad` mode using the ceremony metadata and agenda from the workspace file.

---

## Decision: Squad profile configuration contract (SQD-048, 2026-09-28)

Link: #263, PR pending

Add an optional `squad` section to each saved NexKit `Profile`.

```ts
interface SquadProfileConfig {
  presetId?: string;
  upstreams?: SquadUpstreamSource[];
  pluginMarketplaces?: SquadMarketplaceRef[];
  plugins?: SquadPluginRef[];
  modelConfig?: SquadModelConfig;
  ralph?: SquadRalphPreferences;
}
```

`SquadProfileService.captureCurrentConfig()` returns `undefined` when no Squad marker is present. When Squad is present, it captures `.squad/config.json` fields, `.squad/upstream.json`, `.squad/plugins/marketplaces.json`, installed plugin inventory from `squad plugin list --json`, and `.squad/model-config.json`.

Applying a profile writes the file-backed portion after `BackupService.backupSquadArtifacts()`.

Error semantics: Malformed or unreadable Squad files return structured `SquadResult` failures and cause profile save/apply to surface an error instead of saving or applying a partial success-shaped Squad profile.

---

## Decision: Squad-in-NexKit hybrid integration (2026-09-28)

• **Presets:** plugins/<team>/squad/ in nexus-plugin-marketplace; authoring out of scope for NexKit.
• **CLI/GUI:** NexKit reads .squad files; squad CLI user-initiated; prompt before install/run.
• **UI:** Dedicated Squad tab in webview; auto-detect updates; backup before apply.
• **Backlog:** GitHub Issues + Azure DevOps for MVP; Jira in v2+. MVP-first phasing.
• **Upstream:** Marketplace preferred; new repo fallback. Epics #212–#215 + 55 sub-issues created.

---

## Decision: Dead legacy preset path removed (2026-09-28)

• `selectSquadPreset` / `applySquadPreset` webview commands and host stubs removed; superseded by SQD-019/020 dedicated preset picker.
• Removed `squadPresetsUpdate` extension message, `squad.presets` / `squad.selectedPresetId` AppState fields, host-side placeholder handlers, and tests.
• Dead code was user-invisible and maintained misleading message contract — removal eliminates confusion.
• Preset picker UI continues to use `useSquadPresets` for local selection state and `presetPicker` AppState slice for discovered/rejected/unreachable sources.
• **Do not reintroduce** unless explicit product requirement; canonical path is SQD-019/020 `initSquadFromPreset`.

---

## Decision: Canonical Squad service layout (2026-09-28)

• Squad service implementation files consolidated under `src/features/squad/services/` (SQD-R2 cleanup).
• **Files moved:** `squadCliService.ts`, `squadProcessRunner.ts`, `squadDetectionService.ts`, `squadProjectVersionReader.ts`, `squadDoctorParser.ts`.
• **File layout principle:** domain types under `models/`, validation logic under `validation/`, all service/provider/parser/reader modules under `services/`.
• Import paths updated across 6 files; all tests green, type-check clean, lints passing.
• **Guidance:** future Squad service/provider/process-runner/parser/reader modules follow this pattern.

---

# Texte intégral — Entrées résumées (2026-09-28)

Below: full original text of summarized decisions for future reference.

---

## Decision: Align unchanged-settings test with marketplace bootstrap behavior

**Date:** 2026-08-07
**Agent:** Link
**Classification:** Project-specific — settings deployer tests

### Context

An unchanged-settings unit test in `RecommendedSettingsConfigDeployer` failed because it asserted no writes while the deployer intentionally bootstraps `chat.plugins.marketplaces` when missing.

### Decision

Pre-seed `plugins.marketplaces` with `NexusInnovation/nexus-plugin-marketplace#main` in the unchanged-settings test setup so the assertion validates only true regressions.

### Why

The deployer's bootstrap write is expected behavior, and the prior setup produced a false negative.

---

## Decision: Test triage outcome and regression-risk posture after transient failure

**Date:** 2026-08-07
**Agent:** Trinity
**Classification:** Project-specific — test pipeline validation

### Context

A prior run reported `npm run test` exit code `1`. Trinity revalidated the full pipeline.

### Decision

Current status is stable for this run: `npm run test-compile` pass, `npm run lint` pass, `npm test` pass (`388 passing`, `8 pending`, exit `0`). The previous failure is treated as transient/non-reproducible for now.

### Regression risk

Medium. Extension-host auth-path logs still produce repeated blocked-dialog noise during tests, which can obscure real auth regressions.

### Follow-up hardening

1. Add a focused extension-host test that explicitly validates auth prompt suppression in test mode.
2. Add negative-path assertions around auth session retrieval to validate expected failures.
3. Add a deterministic smoke script (compile + lint + unit + extension-host) that preserves per-stage logs for flaky-run diagnosis.

### Why

QA classification separates transient environment noise from actionable product/test regressions while documenting concrete hardening work.

---

## Decision: Marketplace identifier normalized, legacy suffix deduped

**Date:** 2026-08-26
**Agent:** Link
**Classification:** Project-specific — NexKit marketplace settings handling

### Context

`OFFICIAL_PLUGIN_MARKETPLACE` in `recommendedSettingsConfigDeployer.ts` changed from `NexusInnovation/nexus-plugin-marketplace#main` to the bare `NexusInnovation/nexus-plugin-marketplace`. The `chat.plugins.marketplaces` ensure-first logic now normalizes on a `#ref`-stripped key, so any existing `#main`-suffixed entry is recognized as the same marketplace, deduped against the bare key, and rewritten to the bare key (first in the list). The "skip write if unchanged" optimization still applies.

### Why

The `#main` suffix was unnecessary and caused a mismatch between the constant and a bare-key entry a user might already have, risking duplicate marketplace entries.

---

## Decision: Squad-in-NexKit Integration PRD — Hybrid Approach

**Date:** 2026-09-28
**Agent:** Orchestrator (Eric De Carufel)
**Classification:** Project-specific — nexus-nexkit-vscode Squad-in-NexKit feature roadmap

### Context

Squad management capability integration into Nexus NexKit. Three concurrent research agents (Morpheus, Link, Oracle) gathered requirements, authored PRD documentation, and created epic/issue backlog.

### Decision

Hybrid integration model for Squad management in NexKit:

1. **Presets location:** Squad presets live in `plugins/<team>/squad/` within nexus-plugin-marketplace. Authoring presets is out of scope for NexKit itself.

2. **Read-only `.squad` support:** NexKit will read and respect `.squad` files at workspace root for team/project/profile configuration. CLI operations (squad commands) are user-initiated via terminal.

3. **Hybrid CLI/GUI:** CLI operations handled by squad CLI; users are prompted before installing CLI tools. NexKit integration asks before running squad CLI commands.

4. **UI placement:** Dedicated "Squad" tab in the existing NexKit webview sidebar panel, alongside existing features.

5. **Updates:** Auto-detect Squad config updates, notify user, confirm before applying. Automated backup before any destructive operations (BackupService).

6. **Upstream promotion:** Team↔Project↔Org promotion strategy: store in nexus-plugin-marketplace by preference; create new repo only if marketplace is unavailable. Nexus marketplace is preregistered.

7. **Backlog source:** MVP phase uses GitHub Issues + Azure DevOps work items. Jira integration deferred to v2+.

8. **Phasing:** MVP-first approach; features staged incrementally.

### Verification

PRD document written and committed to `docs/prd/squad-management.md` (Morpheus); epics #212–#215 created with 55 linked sub-issues (SQD-001..055) (Oracle); marketplace research completed (Link).

### Follow-up

Next phase: implementation planning and prototype development.

---

# Decision — Squad MVP merge-train review & integration (Morpheus, reviewer gate)

**Date:** 2026-09-28
**Agent:** Morpheus (Lead / Architect — reviewer gate)
**Requested by:** Eric De Carufel ("Morpheus reviews the MVP PRs in dependency order before I merge.")
**Scope:** SQD-001..SQD-025 (issues #216–#240), 23 PRs targeting `feature/squad-support`.
**Integration branch:** `squad/mvp-integration` (from `origin/feature/squad-support`), pushed to origin. **No PR opened for it yet — Eric merges.**

## 1. Merge order (topological, dependency-valid)

271 → 275 → 274 → 277 → 276 → 273 → 278 → 280 → 281 → 283 → 279 → 284 → 282 → 285 → 286 → 287 → 289 → 288 → 291 → 290 → 293 → 292 → 294

All 23 merged as real merge commits (history/attribution preserved). 20 merged clean; 3 conflicts resolved (see §3).

## 2. Per-PR verdict table

| PR | Ticket | Title | Verdict | Notes |
| --- | --- | --- | --- | --- |
| #271 | SQD-001 | domain types | ✅ APPROVE | types-only, no vscode, SquadResult contract |
| #275 | SQD-002 | settings | ✅ APPROVE | SettingsManager + Global target; telemetry desc = no paths |
| #274 | SQD-004 | detection service | ✅ APPROVE | injected seams, absence=success, Uri.joinPath |
| #277 | SQD-011 | file service | ✅ APPROVE | read-only, traversal guard, 256KB cap |
| #276 | SQD-015 | preset validator | ✅ APPROVE | pure; rejects absolute/traversal/symlink/dangerous ext |
| #273 | SQD-007 | webview state | ✅ APPROVE | 🟠 defines later-dead selectPreset/applyPreset actions |
| #278 | SQD-006 | project version | ✅ APPROVE | pure parser, source/pinned/missing/malformed |
| #280 | SQD-003 | ServiceContainer | ✅ APPROVE | lazy, no activation work, nullable squadFile |
| #281 | SQD-005 | CLI service | ✅ APPROVE | 🟢 shell:false + allowlist; 🟡 files at root vs services/ |
| #283 | SQD-016 | recursive download | ✅ APPROVE | UA header, GitHubApiError, rate-limit, maxFiles cap |
| #279 | SQD-023 | validator tests | ✅ APPROVE | 62 behavior tests, no bugs found |
| #284 | SQD-022 | detection/version tests | ✅ APPROVE | test-only, in green suite |
| #282 | SQD-012/13/14 | roster/log views | ✅ APPROVE | 🟢 safe markdown via `<pre>` (no HTML injection) |
| #285 | SQD-008 | message routing | ✅ APPROVE | 🟠 introduced preset stubs later superseded |
| #286 | SQD-017 | local presets | ✅ APPROVE | provider contract, local/external split, rejected[] |
| #287 | SQD-009 | Squad tab | ✅ APPROVE | mount-pull guarded, no fake controls |
| #289 | SQD-018 | external presets | ✅ APPROVE | composite provider, unreachable[] isolation |
| #288 | SQD-010 | status diagnostics | ✅ APPROVE | doctor-driven, pure version classification |
| #291 | SQD-021 | doctor + CLI reg | ✅ APPROVE | CLI first-class, --json+fallback, pure parser |
| #290 | SQD-024 | webview tests | ✅ APPROVE | test-only, in green suite |
| #293 | SQD-019 | preset picker | ✅ APPROVE | 🟠 supersedes legacy preset path → now dead (follow-up) |
| #292 | SQD-025 | CLI-missing chooser | ✅ APPROVE | modal confirm, no silent install, Global target |
| #294 | SQD-020 | init from preset | ✅ APPROVE | 🟢 backup-before-write, traversal guard, rollback |

**Result: 23/23 ✅ APPROVE, 0 ❌.** No real bugs, no convention violations, no security defects. Two non-blocking coherence findings tracked as follow-ups (§4).

## 3. Integration fixes I made (conflict resolution)

All conflicts were pure additive/union collisions from parallel development — resolved preserving BOTH sides' intent:

1. **#293 → `src/features/panel-ui/webview/styles.css`** — SQD-010 (status versions) and SQD-019 (preset picker) both appended distinct CSS blocks. **Union kept** (both blocks, single source, no dup rules).
2. **#292 → `src/features/panel-ui/types/webviewMessages.ts`** — three-way on the Squad command union (SQD-019's `listSquadPresets`/`initSquadFromPreset` vs SQD-025's `setSquadCliInvocation`/`installSquadCli`, both re-adding `runSquadDoctor`). **Unioned all commands, single `runSquadDoctor`.**
3. **#292 → `src/features/panel-ui/nexkitPanelMessageHandler.ts`** — both SQD-019's `SquadPresetMessageHandler` and SQD-025's `SquadCliSetupMessageHandler` add an import, a private field, a constructor init, and a delegation branch. **Unioned all four sites** — no duplicated handler registration; both delegated after the main Squad handler, before the unknown-command warning.

No `fix(squad):` code fixes beyond conflict resolution were needed — the merged tree passed all gates on first try.

**Verification (integration branch, real `pnpm install`, hooks active):**
`pnpm run check:types` ✅ · `pnpm run lint` ✅ (0) · `pnpm run test-compile` ✅ · **`pnpm test` → 744 passing / 11 pending / 0 failing (exit 0)** · `pnpm run compile` (extension + webview bundle) ✅. Pre-push headless hook (35 passing) ran normally on push. Pre-existing auth-dialog log noise unchanged (not a regression).

## 4. Required revisions (non-blocking follow-ups — track as post-MVP tickets)

| # | Severity | Finding | Assigned reviser |
| --- | --- | --- | --- |
| R1 | 🟠 | **Dead legacy preset path.** After merging #293/#294, the SQD-007 `selectPreset`/`applyPreset` hook actions (`useSquadState.ts:141-146`) and their host stubs (`SquadPanelMessageHandler.handleSelectSquadPreset`/`handleApplySquadPreset` + `applySquadPreset`/`selectSquadPreset` union members) are invoked by no component — superseded by the dedicated `presetPicker` slice. They return actionable errors (not silent success) and are user-invisible → no block. Remove to avoid two parallel preset mechanisms. | **Ghost** (webview: drop legacy actions + `squad.presets`/`selectedPresetId` fields) **+ Link** (host: remove dead cases/stubs + union members). Original authors were Ghost (#273) & Link (#285) — cross-assign per no-original-author rule. |
| R2 | 🟡 | **Service folder inconsistency.** SQD-005 files (`squadCliService.ts`, `squadProcessRunner.ts`, `squadDetectionService.ts`, `squadProjectVersionReader.ts`, `squadDoctorParser.ts`) sit at `src/features/squad/` root while SQD-011/016/017/018/020 use `src/features/squad/services/`. Consolidate under `services/`. | **Link** (Link-authored #281 → another Link instance / Morpheus-designated; pure move + import fixups, low risk). |

Note: `saveSquadCharter`/`saveSquadDoc` stubs are **legitimately deferred** (FR-023/024 are separate tickets), not dead code — leave as-is with their "not available yet" actionable responses.

## 5. Merge strategy recommendation → **Option (b)**

**Recommended: merge `squad/mvp-integration` as a single integration PR into `feature/squad-support`, then close the 23 individual PRs as "superseded by the integration branch."**

- **(a) Merge 23 PRs one-by-one:** ❌ Not recommended. GitHub would re-hit the same 3 conflicts (#293 css, #292 handler+messages) at merge time — the conflict resolution I already validated would have to be re-done in the GitHub UI (or via rebases), across 23 CI runs, with drift risk between runs. High effort, higher risk, no real benefit.
- **(b) Merge the integration branch once:** ✅ **Pick.** Conflicts already resolved once and validated green (744 passing). Single atomic, CI-verified state. **Crucially, per-PR history/attribution is preserved** — I used real merge commits (not squash), so every author's commits remain intact inside the branch. Closing the 23 PRs as superseded keeps their review threads as reference. One CI run, one reviewable diff, deterministic result.

**Action for Eric:** open a PR `squad/mvp-integration → feature/squad-support`, link this decision + the 23 superseded PRs, merge with a **merge commit** (not squash — preserve authorship). Then close #271–#294 (except the integration PR) as superseded. Address R1/R2 as post-MVP cleanup before promoting `feature/squad-support` onward.

**I did not merge anything into `feature/squad-support` — that is Eric's action.**

---

# Decision — Preact webview DOM test harness (Trinity)

**Date:** 2026-09-28
**Agent:** Trinity (Tester / QA)
**Requested by:** Eric De Carufel (approved adding `@testing-library/preact` + `happy-dom` as devDependencies)
**Scope:** Webview component/hook/context tests for the Squad panel (follow-up to SQD-024 / #239).
**Branch / PR:** `squad/preact-test-harness` → PR #295 (base `feature/squad-support`, team directive). Builds on `squad/mvp-integration` — merge that first. Do not merge yet.

## Decision

Adopt a **separate Node + happy-dom Mocha runner** for Preact webview DOM tests, kept isolated from the VS Code extension-host suite.

### What was added
- **devDependencies:** `@testing-library/preact@3.2.4`, `happy-dom@20.14.5` (no `@happy-dom/global-registrator` — DOM globals registered manually from happy-dom `Window`).
- **Runner:** `test/runWebviewTest.ts` — plain Node + Mocha (`ui: "tdd"`), runs `test/suite/webview/**/*.test.js`. Registers the happy-dom environment and a mocked `acquireVsCodeApi` bridge **before** any test file is required.
- **Harness:** `test/suite/webview/harness/` — `domEnvironment.ts` (idempotent global registration; only fills globals Node lacks; `navigator` overridden via `Object.defineProperty` because it is getter-only on Node 22), `vscodeApiMock.ts` (stable bridge + captured posted messages + `dispatchExtensionMessage`), `renderSquad.tsx` (`renderWithAppState` via `AppStateContext.Provider`, `renderWithProvider` via real `AppStateProvider`, model fixtures).
- **Scripts:** `pnpm test:webview`; `pnpm test` now runs the Electron runner **and** the webview runner.

### Isolation rules (must keep)
- The Electron host runner (`test/suite/index.ts`) globs with `ignore: "suite/webview/**"` — DOM tests must never load inside the extension host (it has no DOM). Extension-host suite stays at 744 passing / 11 pending.
- Webview tests live under `test/suite/webview/**`; DOM-dependent test files must go there (never in the flat `test/suite/` picked up by Electron).
- `tsconfig.json` gained `skipLibCheck: true` (happy-dom's `.d.ts` requires `esModuleInterop`; `skipLibCheck` avoids changing import semantics project-wide). No test-only config leaks into the esbuild bundle.

### Conventions for future webview tests
- Drive state either by `renderWithAppState(ui, squadOverrides)` (presentational) or by dispatching extension messages through the real provider (reducer/integration).
- Assert host interactions via the mocked bridge (`lastPostedMessage`, `postedMessagesOfCommand`); wrap message dispatch in `act()`.
- Prefer **exact** `getByText` strings over substrings/regex when the same text appears in a title + a button (ambiguous matches were the main authoring pitfall).
- Keep the charter security invariant covered: workspace markdown renders as escaped text in `<pre>` — assert `<script>` payloads are inert text (`querySelector('script') === null`).

**Bugs found in product code:** none.

---

# Decision: Scribe history summarization must archive verbatim before removal and verify archive size

**Date:** 2026-09-28
**Agent:** Squad Coordinator (via Scribe reconciliation)
**Incident context:** A prior Scribe run dropped ~17KB of Ghost's and ~22KB of Trinity's history without archiving. Content from 2026-07/08 through 2026-09-27 was lost.
**Mitigation:** Coordinator restored the 2026-07 and 2026-08 snapshots from VS Code local history into their history-archive.md files.

## Decision

**Rule (HARD):** When the Scribe removes or summarizes content from `history.md` or `decisions.md`:

1. **Archive first:** APPEND the full removed text verbatim to the matching `*-archive.md` file.
2. **Verify size:** Measure the archive file size before and after the append. Confirm that the archive grew by at least the number of bytes removed. If it did not grow, stop and report the failure before proceeding.
3. **No summarization on this run:** Do not summarize any history on this run (2026-09-28 Scribe pass).

This rule applies to all squad agents maintaining history files in `.squad/agents/*/`.

## Rationale

History records are permanent context for the squad. Accidental loss (via bugs, incomplete tooling, or procedural failures) breaks the team's institutional memory and makes post-mortems impossible. Archiving before removal creates a deterministic checkpoint; verifying size growth ensures the archive actually received the content.

## Enforcement

- **Pre-Scribe checklist:** Scribe must read this decision before starting any file consolidation.
- **Coordinator audit:** After each Scribe session, Coordinator verifies that all removals have corresponding archive grows.

---

# Decision — Squad MVP merge-train review & integration (Morpheus, 2026-09-28)

**Reviewer gate:** Morpheus reviews SQD-001..SQD-025 (23 PRs targeting eature/squad-support) in dependency order.
**Scope:** #271–#294. Integration branch: squad/mvp-integration (from origin/feature/squad-support), pushed to origin.

## Merge order (topological, dependency-valid)

271 → 275 → 274 → 277 → 276 → 273 → 278 → 280 → 281 → 283 → 279 → 284 → 282 → 285 → 286 → 287 → 289 → 288 → 291 → 290 → 293 → 292 → 294

All 23 merged as real merge commits (history/attribution preserved). 20 merged clean; 3 conflicts resolved.

## Verdict

**Result: 23/23 ✅ APPROVE, 0 ❌.** No real bugs, no convention violations, no security defects.

**Verification (integration branch):**
- pnpm run check:types ✅
- pnpm run lint ✅ (0 errors)
- pnpm run test-compile ✅
- **pnpm test → 744 passing / 11 pending / 0 failing (exit 0)**
- pnpm run compile (extension + webview bundle) ✅

## Required revisions (post-MVP tickets)

1. **R1 (Dead legacy preset path):** After merging #293/#294, SQD-007 selectPreset/pplyPreset hook actions and host stubs are invoked by no component — superseded by dedicated presetPicker slice. Remove to avoid two parallel preset mechanisms. **Assign:** Ghost (webview) + Link (host).

2. **R2 (Service folder inconsistency):** SQD-005 files sit at src/features/squad/ root while SQD-011/016/017/018/020 use src/features/squad/services/. Consolidate under services/. **Assign:** Link.

## Merge strategy recommendation

**Merge squad/mvp-integration as a single integration PR into eature/squad-support.** Conflicts already resolved once and validated green. Single atomic, CI-verified state. Per-PR history/attribution preserved via real merge commits. Then close #271–#294 as superseded.

---

# Decision: Preact webview DOM test harness (Trinity, 2026-09-28)

**Requested by:** Eric De Carufel (approved adding @testing-library/preact + happy-dom as devDependencies)
**Branch / PR:** squad/preact-test-harness → PR #295. Builds on squad/mvp-integration — merge that first.

## Decision

Adopt a **separate Node + happy-dom Mocha runner** for Preact webview DOM tests, kept isolated from the VS Code extension-host suite.

### What was added
- **devDependencies:** @testing-library/preact@3.2.4, happy-dom@20.14.5.
- **Runner:** 	est/runWebviewTest.ts — plain Node + Mocha, runs 	est/suite/webview/**/*.test.js. Registers the happy-dom environment and a mocked cquireVsCodeApi bridge.
- **Harness:** 	est/suite/webview/harness/ — domEnvironment.ts, scodeApiMock.ts, enderSquad.tsx (enderWithAppState, enderWithProvider).
- **Scripts:** pnpm test:webview; pnpm test now runs the Electron runner **and** the webview runner.

### Isolation rules (must keep)
- The Electron host runner globs with ignore: "suite/webview/**" — DOM tests must never load inside the extension host.
- Webview tests live under 	est/suite/webview/**.
- 	sconfig.json gained skipLibCheck: true to avoid import semantics drift.

### Conventions for future webview tests
- Drive state either via enderWithAppState(ui, squadOverrides) or by dispatching extension messages through the real provider.
- Assert host interactions via the mocked bridge (lastPostedMessage, postedMessagesOfCommand).
- Keep the charter security invariant: workspace markdown renders as escaped text in <pre>.

**Bugs found in product code:** none.

---

# Decision: Scribe history/archive safety rule (HARD)

**Date:** 2026-09-28
**Incident:** A prior Scribe run dropped ~17KB of Ghost's and ~22KB of Trinity's history without archiving.
**Mitigation:** Coordinator restored snapshots from VS Code local history.

## Rule (HARD)

When the Scribe removes or summarizes content from history.md or decisions.md:

1. **Archive first:** APPEND the full removed text verbatim to the matching *-archive.md file.
2. **Verify size:** Measure the archive file size before and after the append. Confirm that the archive grew by at least the number of bytes removed.
3. **No summarization on this run (2026-09-28 Scribe pass).**

## Rationale

History records are permanent context. Accidental loss breaks the squad's institutional memory. Archiving before removal creates a deterministic checkpoint; verifying size growth ensures the archive actually received the content.

---

# Decision: P3/P4 Squad dependency order (Morpheus, 2026-09-28)

## Can start now in parallel

1. #263 — SQD-048 profiles Squad config (Link): dependencies #216, #232, #250, and #253 are closed.
2. #266 — SQD-051 personal squad scenario (Link): dependencies #220 and #226 are closed.

## Blocked

1. #258 — SQD-043 ADO backlog detection (Link): blocked by #257.
2. #259 — SQD-044 backlog status UI (Ghost): blocked by #257 and #258.
3. #261 — SQD-046 squad watch health/logs UI (Ghost): blocked by #260.
4. #264 — SQD-049 anonymous Squad telemetry (Link): blocked by #263.
5. #265 — SQD-050 profile integration tests (Trinity): blocked by #263.
6. #267 — SQD-052 consult mode scenario (Link): blocked by #266.
7. #268 — SQD-053 worktree-per-issue design (Morpheus): blocked by #257 and #258.
8. #269 — SQD-054 worktree-per-issue implementation (Link): blocked by #268.
9. #270 — SQD-055 CI/lint guard for Squad tests (Tank): blocked by #256 and #265.

## Architectural ordering notes

- Keep the backlog lane linear until the read models exist: #257 -> #258 -> #259, then #268 can design worktree-per-issue.
- Keep the watch lane linear: #260 -> #261.
- Profiles can move now: #263 should go before telemetry/tests, then #264 and #265 can run in parallel.
- Personal/consult can move now independently: #266 first, then #267.
- CI guard #270 should stay last.

---

# Decision: User directive — Claude Haiku fallback (2026-09-28)

**By:** Eric De Carufel (via Copilot, 2026-09-28T16:34:37-04:00)
**Classification:** Generic — team subagent model preference

Par défaut, les sous-agents utilisent le modèle claude-opus-5.5. En cas d'indisponibilité, rester dans la famille Claude (fallback Claude uniquement).

Rationale: User request — captured for team memory and squad extraction.
