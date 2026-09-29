# Ghost — History

## Project Context

**Project:** nexus-nexkit-vscode — a TypeScript VS Code extension with a Preact-powered sidebar webview. Manages AI templates (agents, prompts, instructions, chatmodes) from GitHub repositories.

**Stack:** TypeScript 5.x (strict), Preact (webview sidebar), esbuild bundling, Mocha + Sinon (testing).

**Owner:** Eric Decarufel

**My domain — webview architecture:**
- Components: `src/features/panel-ui/webview/components/` (atoms / molecules / organisms)
- Hooks: `src/features/panel-ui/webview/hooks/`
- Central state: `AppState` in `src/features/panel-ui/webview/types/appState.ts`
- Message handling: `src/features/panel-ui/webview/contexts/AppStateContext.tsx`
- Root app: `src/features/panel-ui/webview/components/App.tsx`

## Summary of Prior Learnings

- **Preact specifics:** Use `class` (not `className`) for DOM elements. Import from `'preact'` and `'preact/hooks'`, not React.
- **Component architecture:** Atoms (button/input/label), molecules (form fields), organisms (sections). All purely presentational; state reads from selector hooks.
- **Message boundary:** All mutations dispatch actions to host. Central handler in `AppStateContext.tsx` is single source of truth for message routing.
- **Form patterns:** Re-validate on keystroke (debounce with cleanup on unmount). Modal confirmations use vscode dialogs (host-driven).
- **Error handling:** Shared error slice per feature; all errors render via ErrorNotice component. Never silent failures.
- **RTF Converter architecture (2026-07-10):** Client-side in `webview/main.tsx`; isolated component state; markdown-it requires @types/markdown-it.

## 2026-09-28 — Squad Webview Development (SQD-009 through SQD-025)

Implemented 5 major SQD webview tickets (see `.squad/decisions.md` for full details):

- **SQD-009 (#287):** Squad tab in NexKit panel — on-activation data fetch, detected/not-detected branches, collapsible sections, error de-duplication

- **SQD-010 (#288):** Status & diagnostics — version classification (pinned/source/unknown), Doctor diagnostics rendering, CLI-missing notice with chooser slot

- **SQD-012/013/014 (#284):** Read-only panel views — SquadRosterSection, SquadGovernanceSection, SquadLogSection, SquadMarkdownView, SquadErrorNotice. Safe markdown (escaped text, zero script risk). Truncation at 256KB with "open file" affordance. All purely presentational.

- **SQD-019 (#293):** Preset picker UI — listSquadPresets discovery, initSquadFromPreset request. New dedicated SquadState.presetPicker slice. Init handler "not available yet" stub (Link #235 fills real flow).

- **SQD-025 (#292):** CLI-missing diagnostics & chooser — setSquadCliInvocation (global/npx/custom), installSquadCli (modal, terminal, never silent). Component presentational; all side effects in host handler.

**Patterns established:**
- Selector hooks re-filter/re-map on every render (lightweight, deterministic)
- All errors bubble to shared slice + ErrorNotice component
- Modal dialogs host-driven; webview sends request, host shows vscode dialog
- Truncated content shows "open file" affordance
- All component state reads from AppState via hooks

## 2026-09-28 — Follow-up issues (SQD-R1, SQD-R2)

**Issue #297 (SQD-R1: Dead legacy preset path):** Morpheus identified that after merging SQD-019 (#293) and SQD-020 (#294), the SQD-007 `selectPreset`/`applyPreset` hook actions and their host stubs are superseded by the dedicated `presetPicker` slice. Cross-team cleanup needed: Ghost removes legacy actions + `squad.presets`/`selectedPresetId` fields from webview state and AppState; Link removes corresponding dead host cases and union members. Both are return actionable errors (not silent), so removal is safe. Tracked as issue #297 for post-MVP cleanup.

**Issue #298 (SQD-R2: Service folder inconsistency):** SQD-005 files (`squadCliService.ts`, `squadProcessRunner.ts`, `squadDetectionService.ts`, `squadProjectVersionReader.ts`, `squadDoctorParser.ts`) sit at `src/features/squad/` root while SQD-011/016/017/018/020 use `src/features/squad/services/`. Link to consolidate under `services/` (pure move + import fixups, low risk). Tracked as issue #298.

## Learnings

### 2026-09-28 — SQD-R1 (#297): Dead legacy preset path removed

- Legacy `selectSquadPreset` / `applySquadPreset` webview commands and `squadPresetsUpdate` host-to-webview message are fully superseded by `listSquadPresets`, `squadPresetsDiscovered`, and `initSquadFromPreset`.
- The current picker keeps selected preset state locally in `useSquadPresets`; it should not be promoted back into `AppState`.
- When merging concurrent Squad webview PRs, re-scan for removed command strings because newly landed tests can reintroduce references even when source code is already clean.

## 2026-09-28 — Ralph Round 1, P2 Kickoff (Team Update)

**From Scribe:** SQD-R1 (issue #297, PR #299) completed and merged into feature/squad-support. Legacy selectSquadPreset/pplySquadPreset webview commands, host stubs, and corresponding AppState fields removed. Canonical preset flow now fully via SQD-019/020 listSquadPresets / initSquadFromPreset pathway.

**Cross-team note:** Link (SQD-R2) consolidated 5 Squad service files under src/features/squad/services/ — service/provider/parser/reader modules now follow canonical folder layout. Trinity validated Preact webview test harness (69 tests passing, isolated from extension-host suite). All three changes landed safely.

**MVP Status:** All 23 SQD PRs merged into squad/mvp-integration branch (Morpheus reviewed, 744 tests passing). Ready for Eric's merge to feature/squad-support.

## 2026-09-29 — SQD-040 (#255): Upstreams and plugins UI

- Finished the P2 Squad webview UI for FR-030/031/032 and FR-042/043/044 on branch `squad/255-upstreams-plugins-ui` (PR #317).
- Upstreams now have dedicated selector/action plumbing (`useSquadUpstreams`), add/list/sync/remove controls, operation feedback, retry for retryable failures, and no false success state for failed/cancelled operations.
- Plugins now have marketplace and installed-plugin inventory, Nexus marketplace shortcut, marketplace registration, validate/dry-run/install/enable/disable/uninstall/refresh actions, and visible action output/errors through shared feedback UI.
- Added `test/suite/webview/squadUpstreamsPlugins.test.tsx`; remember that `test:unit` does not run happy-dom webview tests, so run `node .\out\test\runWebviewTest.js` after `test-compile` for component coverage.
- Validation run: `pnpm run check:types`, `pnpm run lint`, `pnpm run test-compile`, `pnpm run test:unit`, and `node .\out\test\runWebviewTest.js` all passed; pre-push also ran pretest + headless tests.

## 2026-09-28 — SQD-047 (#262): Ceremony quick actions completed

- Ceremony quick actions need both host and webview state wiring: `getSquadCeremonies` / `runSquadCeremony` / `openSquadCeremonies` must be routed through `NexkitPanelMessageHandler`, registered in `AppStateContext`, and exposed as hook actions before the Preact section can work.
- The safest launch contract is id-only from the webview; the host re-reads `.squad/ceremonies.md` before opening Copilot Chat so stale, removed, or disabled ceremonies cannot be run from old panel state.
- The no-DOM VNode tests do not render child component nodes; export pure leaf renderers (or assert list structure separately) when testing new Preact organisms without jsdom.

### 2026-09-29 — SQD-029 (#244): Charter/governance editors

- Centralized Squad edit outcomes in `SquadState.lastWrite` with a monotonic `sequence`; editors consume outcomes through hooks instead of adding message listeners outside `AppStateContext.tsx`.
- Governance saves must capture `SquadMarkdownDoc.contentHash` at edit start and send it as `baseContentHash`; `write-conflict` keeps the draft and offers a reload path.
- Persist unsaved editor drafts in VS Code webview state keyed by edit target (`charter:<id>` / `doc:<kind>`) so collapsing sections or reloading the panel does not drop user work.

### 2026-09-29 — SQD-054 (#269): Worktrees section UI

- Worktree UI needs its own top-level `AppState.squadWorktrees` slice instead of overloading the broader Squad detection slice; this keeps create/preview/cleanup pending state independent from Doctor/upstream/plugin operations.
- Partial dependency setup failures are not errors in the reducer: `squadWorktreeCreated` stores the failed dependency outcome and the section renders an explicit retry action that calls a narrow host `retryDependencies(worktreeId)` service method.
- Cleanup remains host-confirmed even when the webview shows a confirmation panel; the webview sends only `worktreeId` plus booleans, and the host re-lists candidates before showing the modal confirmation.

## 2026-09-28 — SQD-044 (#259): Backlog status UI

- Backlog provider state belongs in the Squad `AppState` slice as its own sub-state (`backlog`) rather than overloading the existing Squad detection snapshot; GitHub/ADO failures must render in the backlog card instead of becoming a success-shaped empty state.
- The SQD-042/043 host contract is easiest to consume as dedicated `squadBacklogLoading` / `squadBacklogUpdate` / `squadBacklogError` messages, keeping all webview message handling centralized in `AppStateContext.tsx`.
- When adding host messages to `SquadPanelMessageHandler`, update the older handler tests' service mocks at the same time; otherwise partial `ServiceContainer` fixtures will miss newly required services even though production DI is wired.

## 2026-09-29 — SQD-046 (#261): Squad watch health and log UI

- Consumed Link's SQD-045 `squadWatchUpdate` contract directly from the existing `SquadState.watch` slice; no component-level `window` listeners were needed.
- `getSquadState` does not include a watch snapshot, so the mounted watch section must explicitly call `getSquadWatchStatus` and then rely on live centralized updates.
- Component tests for watch UI must run through `node .\out\test\runWebviewTest.js`; `npm run test:unit` still excludes `test/suite/webview/**`.
