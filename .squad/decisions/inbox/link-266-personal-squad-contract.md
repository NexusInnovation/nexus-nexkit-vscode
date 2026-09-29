# Link — SQD-051 personal Squad contract

Date: 2026-09-28
Issue: #266

## Decision

Personal Squad support is isolated behind `SquadPersonalSquadService` plus serialized webview messages:

- `getStatus()` checks the personal `.squad/team.md` marker under the user's profile and reuses `SquadFileService.readRoster()` for parsing when present.
- Missing personal markers are a successful `not-initialized` state; unreadable or malformed markers stay actionable `SquadResult` failures.
- `initialize()` is the only write-capable path and runs `SquadCliCommand.Init` with `["--global", "--yes"]` after an explicit modal warning that the target is personal/global and outside the workspace.
- The service re-detects after CLI success and fails with `cli-execution-failed` if the personal marker is still absent, so a successful process exit cannot become a false initialized state.
- The webview consumes `squadPersonalSquadStatusUpdate`, `squadPersonalSquadLoading`, `squadPersonalSquadError`, and `squadPersonalSquadInitResult`; these messages are reusable by SQD-052 consult mode without encoding consult-specific behavior.

## Rationale

FR-064 needs the personal scope to be explicit and cautious because `squad init --global` can change user-profile files outside the current repository. Keeping detection and initialization in one service gives #267 a reusable personal-squad precondition while preserving NexKit's existing result-first error contract and CLI allowlist guarantees.
