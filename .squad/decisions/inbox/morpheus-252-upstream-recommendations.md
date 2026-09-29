# Decision: Upstream recommendations as a pure rules service (SQD-037, #252)

**Author:** Morpheus · **Date:** 2026-09-28 · **PR:** #307

## Context
FR-033/034/035 ask NexKit to recommend an org → team → project upstream hierarchy, propose `NexusInnovation/nexus-plugin-marketplace` with reserved per-level folders, and clearly warn that `squad upstream` clones a whole git repo and ignores sub-paths.

## Decisions
1. **Pure, stateless `SquadUpstreamRecommendationService`** (`src/features/squad/services/`). No `vscode` imports, no I/O, no clock; output is JSON-serialisable. Rules are unit-tested directly.
2. **Constructor injection with a default instance** into `SquadPanelMessageHandler` rather than a new `ServiceContainer` member. The service has no external dependency to mock, and this avoids a shared-file conflict with #251 (upstream CLI actions) and avoids breaking other tests' partial `ServiceContainer` mocks.
3. **Contract**: `squadStatusUpdate.upstreamRecommendations: SquadUpstreamRecommendations | null`. `null` = not evaluated (no workspace, manifest read failure, or post-init status from the preset handler). A failed read never renders a clean recommendation state; the `squadError` remains the visible signal. Warnings are **not** errors (no `squadError`).
4. **Levels** always returned in org → team → project order. Classification is by whole-token keyword match on the source id (EN + FR: `org`, `organization`, `team`, `equipe`, `project`, `projet`, …), falling back to the reference; ambiguous or unmatched sources are listed as `unclassifiedSourceIds` (free sources stay allowed, per PRD).
5. **Reserved folders**: `squad/upstreams/<level>` in the marketplace (configurable via options). Because sub-paths are unsupported, the suggestion's `recommendedKind` is `export` and `subpathSupported: false`: the viable way to consume one level is a JSON export generated from its folder, or a dedicated repo per level.
6. **Warning codes**: `subpath-unsupported` (warning, per git source), `full-clone` (warning, whole marketplace as git upstream, suppressed when a sub-path warning already applies), `hierarchy-order` (warning, source listed after a more specific level), `reserved-folder-limitation` (info, while any level is missing). Ordered: per-source → hierarchy → notice.

## Follow-ups
- If Squad CLI ever supports sub-paths, flip `subpathSupported` and drop the reserved-folder notice.
- The marketplace does not yet contain `squad/upstreams/<level>` folders; creating them is a marketplace-repo task.
- SQD-040 (upstream UI) may reuse the suggestion data to prefill `squad upstream add`.
