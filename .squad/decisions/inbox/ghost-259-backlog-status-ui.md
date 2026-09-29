# Ghost decision inbox — SQD-044 backlog status UI

## Context

Issue #259 adds the UI for SQD-042/SQD-043 backlog detection results: GitHub Issues and Azure DevOps support, detected/not-detected status, actionable errors, and the explicit v1 limitation that GitHub Projects/Jira are not active backlog providers.

## Decision

- Added a dedicated `SquadState.backlog` sub-state with `isLoading`, `isReady`, `detection`, and `error` instead of extending `SquadDetectionResult`.
- Added additive host/webview messages: `refreshSquadBacklog`, `squadBacklogLoading`, `squadBacklogUpdate`, and `squadBacklogError`.
- Rendered the new presentational `SquadBacklogStatusSection` inside `SquadStatusSection`, with provider-specific details, item counts, not-detected remediation, and visible errors via `SquadErrorNotice`.
- Wired `SquadPanelMessageHandler` to `ServiceContainer.squadBacklog` on initial Squad state refresh and explicit backlog refresh.

## Validation

- `npm run check:types`
- `npm run lint`
- `npm run test-compile`
- `npm run test:unit` (992 passing, 11 pending)
