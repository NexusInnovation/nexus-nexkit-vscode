# Decision: Squad domain type layout (SQD-001)

**Date:** 2026-09-28
**Agent:** Morpheus (Lead / Architect)
**Issue:** NexusInnovation/nexus-nexkit-vscode#216
**Classification:** Project-specific — Squad-in-NexKit foundation

## Context

SQD-001 is the foundation ticket for the Squad epic. SQD-002 (settings),
SQD-003 (ServiceContainer), SQD-004 (detection), SQD-007 (webview AppState),
SQD-011 (file service) and SQD-015 (preset validator) all depend on these
types. Covers PRD FR-001, FR-002, FR-010, FR-060, FR-065.

## Decision

Squad domain types live under `src/features/squad/models/`, types/interfaces/
const-maps only (no service logic), re-exported from a barrel `index.ts`.
Downstream code imports from `../squad/models` (or the barrel), never from
individual files, so file layout can evolve without breaking importers.

### File layout

| File | Responsibility | PRD |
| --- | --- | --- |
| `squadResult.ts` | `SquadResult<T>` discriminated union + `SquadError`/`SquadErrorCode`, `squadOk`/`squadErr` builders and `isSquadOk`/`isSquadErr` guards | errors visible/actionable, never a success state |
| `squadDetection.ts` | Marker files, `SquadInstallState`, `SquadVersionStatus`, `SquadCliSource`, `SquadProjectInfo`, `SquadCliInfo`, `SquadDetectionResult` | FR-001, FR-002, FR-003 |
| `squadRoster.ts` | `SquadRosterMember`, `SquadCharter` | FR-022, FR-023 |
| `squadDocs.ts` | `SquadDocKind`, `SquadMarkdownDoc` (decisions + routing) | FR-024 |
| `squadPreset.ts` | `SquadPreset`, `SquadPresetSource`, `SquadPresetSourceKind` | FR-010, FR-011, FR-012 |
| `squadDoctor.ts` | `SquadDoctorReport`, `SquadDoctorCheck`, `SquadDoctorSeverity` | FR-060 |
| `squadConfig.ts` | `SquadUpstreamSource`, `SquadPluginRef`, `SquadAgentModelConfig`, `SquadRalphPreferences` | FR-030, FR-042, FR-063, FR-028 |
| `squadProfileConfig.ts` | `SquadProfileConfig` (Squad slice of a NexKit profile) | FR-065 |
| `index.ts` | Barrel re-export | — |

## Conventions the team must follow

- **Error handling is `SquadResult<T>`-first.** Fallible Squad operations
  (detection, CLI calls, file reads, preset fetch, doctor) return
  `SquadResult<T>`; the failure branch carries a structured `SquadError` with
  a `code`, user-facing `message`, and actionable `remediation`. Do not return
  bare `null`/`undefined` for failures — that hides errors as success.
- **Const-asserted PascalCase objects for enums** (e.g. `SquadInstallState`,
  `SquadVersionStatus`) with a matching exported union type of the same name,
  per repo convention — not TS `enum`. `SQUAD_*` array constants use
  `UPPER_SNAKE_CASE`.
- **`unknown` is a first-class version state** (FR-002): `projectVersion` is
  `string | null` and `versionStatus` includes `Unknown`; never coerce a
  missing version into a fake value.
- **Read-model shapes hold raw markdown** (`SquadCharter.content`,
  `SquadMarkdownDoc.content`) so the panel can round-trip edits with a
  `BackupService` backup before writing.
- **Paths are workspace-root-relative strings** in these models; consumers
  join them with `vscode.Uri.joinPath` — never string-concatenate.
- **No `vscode` imports in models** so they are safe to import from webview
  (Preact) code as well as the extension host.

## Downstream guidance

- **SQD-002 (settings):** persist a custom CLI path / `SquadCliSource` and any
  Squad settings via `SettingsManager`.
- **SQD-003 (ServiceContainer):** the detection service returns
  `Promise<SquadResult<SquadDetectionResult>>`.
- **SQD-004 (detection):** populate `SquadProjectInfo` from `SQUAD_MARKER_FILES`
  and the `<!-- version: x -->` comment; populate `SquadCliInfo` from a
  timed-out `squad version` call.
- **SQD-007 (webview AppState):** add a Squad slice typed from these models;
  keep message handling centralised in `AppStateContext`.
- **SQD-011 (file service):** return `SquadResult<T>` and back up before writes.
- **SQD-015 (preset validator):** validate into `SquadPreset` and fail with
  `preset-invalid` / `preset-fetch-failed` codes.

## Verification

`pnpm run check:types` ✅, `pnpm run lint` ✅, `pnpm run test-compile` ✅,
`squadResult` unit test 6 passing ✅.
