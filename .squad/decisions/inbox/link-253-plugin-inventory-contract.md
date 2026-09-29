# Decision: Squad plugin inventory contract

**Date:** 2026-09-28
**Agent:** Link
**Issue:** NexusInnovation/nexus-nexkit-vscode#253
**Classification:** Project-specific — Squad plugin management

## Context

SQD-038 required NexKit to read Squad plugin marketplaces from `.squad/plugins/marketplaces.json` (FR-042) and installed plugins from `squad plugin list --json` when the CLI supports it (FR-043). SQD-039/#254 and Ghost's plugin UI need a reusable host/service contract rather than one-off panel logic.

## Decision

`SquadPluginService` is the reusable read-only plugin inventory seam. It delegates marketplace file reads to `SquadFileService` and installed plugin listing to `SquadCliService` using the allowlisted `plugin list --json` command. Webview state now carries both `marketplaces` and `plugins`, with `squadPluginsUpdate` available for plugin-only refreshes and `squadStatusUpdate` carrying the same inventory during full Squad refreshes.

Failures remain visible and actionable: malformed marketplace JSON returns `parse-failed`; CLI/list/JSON failures return `cli-not-found` or `plugin-list-failed` and are emitted as `squadError` after partial inventory updates.

## Follow-up

SQD-039/#254 should build marketplace/lifecycle write actions on top of `SquadPluginService` and keep confirmation/backup semantics outside the read-only file layer.
