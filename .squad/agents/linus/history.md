# Linus — History

## Core Context

- **Project:** A TypeScript VS Code extension with a Preact sidebar that manages AI templates, workspace setup, MCP configuration, and self-updates.
- **Role:** UI Dev
- **Joined:** 2026-05-07T15:47:16.736Z

## Learnings

<!-- Append learnings below -->

### 2026-05-07: Panel UI user-directory architecture update (Issue #149)
- Key files for initialization buttons: `ActionsSection.tsx`, `ApmActionsSection.tsx`, `ToolsSection.tsx`
- Mode selection features list lives in `ModeSelectionSection.tsx`
- `AppState.workspace` is the place to add new extension-to-webview state (backed by `workspaceStateUpdate` message from `nexkitPanelMessageHandler.ts`)
- `SettingsManager.isUserDeployMode()` and `SettingsManager.isWorkspaceOverrideActive()` determine template storage location
- Profile text referencing "workspaces" lives in `ProfileSection.tsx`
- Source indicator only shown when `workspaceOverrideActive` is true (user + workspace coexist)
- The webview types for extension messages are in `src/features/panel-ui/types/webviewMessages.ts`
