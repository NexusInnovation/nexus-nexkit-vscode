# Component Inventory — Nexkit VS Code Extension

## Overview

The Nexkit webview sidebar is a Preact single-page application using **Atomic Design** methodology. Components are organized into atoms (smallest reusable units), molecules (composed atoms), and organisms (complete UI sections).

## Architecture

- **State**: Centralized via `AppStateContext` — holds workspace, templates, profiles, DevOps, workflows, and metadata scan state
- **Hooks**: Selector pattern — `useTemplateData()`, `useProfileData()`, `useMode()` instead of raw `useAppState()`
- **Message handling**: Only in `AppStateContext.tsx` — never in individual components
- **Components**: Purely presentational — action logic lives in hooks

## Atoms (7 components)

Smallest reusable UI elements.

| Component             | File                            | Description                                       |
| --------------------- | ------------------------------- | ------------------------------------------------- |
| `FilterMenu`          | `atoms/FilterMenu.tsx`          | Dropdown to filter templates by type/state        |
| `GroupMenu`           | `atoms/GroupMenu.tsx`           | Dropdown to group templates by repository/type    |
| `IconTooltip`         | `atoms/IconTooltip.tsx`         | Icon with hover tooltip                           |
| `ProfileInfoTooltip`  | `atoms/ProfileInfoTooltip.tsx`  | Profile metadata tooltip                          |
| `SearchBar`           | `atoms/SearchBar.tsx`           | Text search input with debounce                   |
| `TemplateInfoTooltip` | `atoms/TemplateInfoTooltip.tsx` | Template metadata tooltip (version, source)       |
| `TemplateItem`        | `atoms/TemplateItem.tsx`        | Single template row with install/uninstall toggle |

## Molecules (4 components)

Composed groups of atoms forming functional units.

| Component            | File                               | Description                                           |
| -------------------- | ---------------------------------- | ----------------------------------------------------- |
| `CollapsibleSection` | `molecules/CollapsibleSection.tsx` | Expandable/collapsible content section                |
| `TabBar`             | `molecules/TabBar.tsx`             | Horizontal tab navigation                             |
| `TypeSection`        | `molecules/TypeSection.tsx`        | Grouped template list by type (agents, prompts, etc.) |
| `WorkflowRunnerTool` | `molecules/WorkflowRunnerTool.tsx` | GitHub Actions workflow trigger UI                    |

## Organisms (10 components)

Complete UI sections that compose the sidebar panels.

| Component              | File                                 | Description                                   |
| ---------------------- | ------------------------------------ | --------------------------------------------- |
| `ActionsSection`       | `organisms/ActionsSection.tsx`       | Developer mode actions (init workspace, etc.) |
| `ApmActionsSection`    | `organisms/ApmActionsSection.tsx`    | APM mode actions                              |
| `ApmConnectionSection` | `organisms/ApmConnectionSection.tsx` | Azure DevOps connection management            |
| `ApmTemplateSection`   | `organisms/ApmTemplateSection.tsx`   | APM-specific template browser                 |
| `FooterSection`        | `organisms/FooterSection.tsx`        | Version info, feedback link                   |
| `ModeSelectionSection` | `organisms/ModeSelectionSection.tsx` | Developer/APM mode switcher                   |
| `ProfileSection`       | `organisms/ProfileSection.tsx`       | Profile save/apply/delete UI                  |
| `RepositorySection`    | `organisms/RepositorySection.tsx`    | Repository source browser                     |
| `TemplateSection`      | `organisms/TemplateSection.tsx`      | Main template browser and installer           |
| `ToolsSection`         | `organisms/ToolsSection.tsx`         | Tools panel (workflow runner, etc.)           |

## Contexts (2)

| Context                   | File                                   | Description                                                                           |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `AppStateContext`         | `contexts/AppStateContext.tsx`         | Central state + message handler. All `window.addEventListener('message')` lives here. |
| `TemplateMetadataContext` | `contexts/TemplateMetadataContext.tsx` | Metadata scan state for fuzzy search                                                  |

## Hooks (11)

| Hook                        | File                                 | Description                                       |
| --------------------------- | ------------------------------------ | ------------------------------------------------- |
| `useAppState`               | `hooks/useAppState.ts`               | Raw access to AppState (prefer selectors)         |
| `useTemplateData`           | `hooks/useTemplateData.ts`           | Selector: template repositories + installed state |
| `useProfileData`            | `hooks/useProfileData.ts`            | Selector: profile list + operations               |
| `useDevOpsConnections`      | `hooks/useDevOpsConnections.ts`      | Selector: DevOps connection state                 |
| `useActiveTab`              | `hooks/useActiveTab.ts`              | Current sidebar tab state                         |
| `useDebounce`               | `hooks/useDebounce.ts`               | Debounced value (for search)                      |
| `useExpansionState`         | `hooks/useExpansionState.ts`         | Track expanded/collapsed sections                 |
| `useFilterMode`             | `hooks/useFilterMode.ts`             | Template filter state                             |
| `useMode`                   | `hooks/useMode.ts`                   | Current operation mode (Developer/APM)            |
| `useVSCodeAPI`              | `hooks/useVSCodeAPI.ts`              | VS Code webview API wrapper (`acquireVsCodeApi`)  |
| `useWebviewPersistentState` | `hooks/useWebviewPersistentState.ts` | Persist state across webview lifecycle            |

## Root Component

| Component | File                 | Description                                    |
| --------- | -------------------- | ---------------------------------------------- |
| `App`     | `components/App.tsx` | Root component — renders mode-dependent layout |

## Design Patterns

### State Flow

```
Extension Host                    Webview
─────────────                    ───────
ServiceContainer                 AppStateContext
     │                                │
     ├── onDataChanged ──────────►    ├── dispatch state update
     ├── onProfilesChanged ──────►    ├── dispatch state update
     ├── onConnectionsChanged ───►    ├── dispatch state update
     │                                │
     │                                ▼
     │                           Selector Hooks
     │                           (useTemplateData, etc.)
     │                                │
     │                                ▼
     │                           Organisms → Molecules → Atoms
     │                                │
     │    ◄── postMessage ────────────┘
     │         (installTemplate,
     │          applyProfile, etc.)
     ▼
NexkitPanelMessageHandler
     │
     ├── routes message to handler
     ├── calls service method
     └── sends response via postMessage
```

### Component Composition (Developer Mode)

```
App
├── ModeSelectionSection
├── ActionsSection
├── ProfileSection
├── TemplateSection
│   ├── SearchBar
│   ├── FilterMenu + GroupMenu
│   └── TypeSection[]
│       └── TemplateItem[]
│           └── TemplateInfoTooltip
├── RepositorySection
├── ToolsSection
│   └── WorkflowRunnerTool
└── FooterSection
```

### Component Composition (APM Mode)

```
App
├── ModeSelectionSection
├── ApmActionsSection
├── ApmConnectionSection
├── ApmTemplateSection
│   └── TypeSection[]
│       └── TemplateItem[]
└── FooterSection
```
