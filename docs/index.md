# Nexkit VS Code Extension — Documentation Index

> Generated: 2026-03-25 | Scan Level: Deep | Mode: Initial Scan

## Project Overview

- **Type:** Monolith (single VS Code extension)
- **Primary Language:** TypeScript 5.9.x (strict mode)
- **Architecture:** Service-oriented with dependency injection (`ServiceContainer`)
- **UI:** Preact sidebar webview (Atomic Design)
- **Version:** 3.7.0-beta.12

## Quick Reference

| Item                     | Value                                                       |
| ------------------------ | ----------------------------------------------------------- |
| **Tech Stack**           | TypeScript, Preact, esbuild, VS Code Extension API 1.105.0+ |
| **Entry Point**          | `src/extension.ts` → `out/extension.js`                     |
| **Webview Entry**        | `src/features/panel-ui/webview/main.tsx` → `out/webview.js` |
| **Architecture Pattern** | Service-oriented DI, message-passing (extension ↔ webview)  |
| **Services**             | 27 registered in `ServiceContainer`                         |
| **Features**             | 11 feature modules under `src/features/`                    |
| **Commands**             | 16+ VS Code commands                                        |
| **Tests**                | 31 test files (Mocha + Sinon)                               |
| **CI/CD**                | GitHub Actions, semantic-release, multi-OS                  |

## Generated Documentation

- [Project Overview](./project-overview.md) — Executive summary, capabilities, tech stack
- [Architecture](./architecture.md) — Architecture pattern, service container, message protocol, feature deep-dives
- [Source Tree Analysis](./source-tree-analysis.md) — Annotated directory tree, critical folders, entry points
- [Component Inventory](./component-inventory.md) — Preact UI components (atoms, molecules, organisms), hooks, contexts
- [Development Guide](./development-guide.md) — Setup, build, test, conventions, git workflow, adding features

## Existing Project Documentation

### Root

- [README.md](../README.md) — User-facing installation, features, modes
- [AGENTS.md](../AGENTS.md) — Developer guide: setup, architecture, conventions, project structure
- [CHANGELOG.md](../CHANGELOG.md) — Auto-generated changelog (semantic-release)
- [CUSTOM-LAYOUT-CONFIGURATION.md](../CUSTOM-LAYOUT-CONFIGURATION.md) — Sidebar layout customization
- [LICENSE.md](../LICENSE.md) — MIT License

### Source

- [src/AGENTS.md](../src/AGENTS.md) — Source-level coding conventions

### Scripts (Installation & Deployment)

- [scripts/README.md](../scripts/README.md) — Script documentation overview
- [scripts/QUICK-INSTALL.md](../scripts/QUICK-INSTALL.md) — Quick installation guide
- [scripts/INTUNE-DEPLOYMENT.md](../scripts/INTUNE-DEPLOYMENT.md) — Intune deployment guide
- [scripts/GITHUB-OAUTH-APP-SETUP.md](../scripts/GITHUB-OAUTH-APP-SETUP.md) — GitHub OAuth App setup
- [scripts/TESTING.md](../scripts/TESTING.md) — Script testing guide

### Infrastructure

- [infrastructure/badge-service/README.md](../infrastructure/badge-service/README.md) — Badge service Azure Function
- [infrastructure/badge-service/QUICKSTART.md](../infrastructure/badge-service/QUICKSTART.md) — Badge service quickstart
- [infrastructure/badge-service/DEPLOYMENT-CHECKLIST.md](../infrastructure/badge-service/DEPLOYMENT-CHECKLIST.md) — Deployment checklist

### Tests

- [test/README.md](../test/README.md) — Test suite documentation

## Getting Started

### For New Developers

1. Read the [Development Guide](./development-guide.md) for setup instructions
2. Review the [Architecture](./architecture.md) to understand the service-oriented pattern
3. Browse the [Source Tree Analysis](./source-tree-analysis.md) to locate code
4. Check [AGENTS.md](../AGENTS.md) for coding conventions

### For AI-Assisted Development

When using AI tools to work on this codebase:

1. **Point to this index** as the primary context source
2. **For feature work**: Reference [Architecture](./architecture.md) for the service container pattern and feature module structure
3. **For UI changes**: Reference [Component Inventory](./component-inventory.md) for the Atomic Design pattern and state management
4. **For new features**: Follow the patterns in [Development Guide](./development-guide.md#adding-new-features)

### For Brownfield PRD

When planning new features on this existing codebase, provide this index to the PRD workflow. Key architectural constraints:

- All services must be registered in `ServiceContainer`
- Settings must go through `SettingsManager`
- Webview state is centralized in `AppStateContext`
- Commands follow `register*Command()` pattern
- File operations require backup via `BackupService`
