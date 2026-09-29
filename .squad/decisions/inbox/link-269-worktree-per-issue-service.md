## Decision: SQD-054 worktree-per-issue service slice (#269)

Implemented the service/model/command portion of Morpheus's #268 design without shipping half-finished UI. The branch adds worktree domain contracts, pure naming, a git CLI client through `SquadProcessRunner`, dependency setup, safe remover fallbacks, `SquadWorktreeService`, backlog item/state extensions for GitHub and Azure DevOps, palette commands, application-scoped settings, README documentation, and unit coverage with all git/process calls stubbed.

Follow-ups intentionally left for the next stacked UI PR: centralized webview message contracts/handler, AppState `squadWorktrees` slice, presentational Worktrees section in the Squad tab, and webview harness tests for preview/partial-success/cleanup UI.
