## Decision: Worktree section UI follow-up (SQD-054 / #269, 2026-09-29)

Ghost implemented the stacked UI follow-up to #329 in PR #330.

- **State shape:** add top-level `AppState.squadWorktrees` with backlog items, worktree list, create preview/outcome, cleanup candidates/result, dependency retry result, and a single pending operation. This avoids coupling worktree operations to the broader `squad.isLoading` flag used by detection, Doctor, upstreams, and plugins.
- **Message routing:** centralize worktree contracts in `src/features/panel-ui/types/webviewMessages.ts` and route host actions through `SquadWorktreeMessageHandler`, delegated from `NexkitPanelMessageHandler`.
- **Retry semantics:** dependency install retry uses a narrow `SquadWorktreeService.retryDependencies(worktreeId, mode?)` method. Re-running `create` would be wrong after partial success because the worktree path already exists.
- **Safety boundary:** cleanup confirmation is visible in the webview for UX, but the host still shows the trusted modal confirmation and re-checks cleanup candidates before calling the service. The webview sends only opaque ids and booleans; paths are display-only.
- **Coverage:** added happy-dom tests for mount refresh, create preview, partial-success retry, and cleanup confirmation; added host handler tests for list/preview/create/retry/open/cleanup routing.
