# Project Overview — Nexkit VS Code Extension

## Executive Summary

Nexkit is a VS Code extension that streamlines AI-powered development workflows by managing AI templates (agents, prompts, instructions, skills, chatmodes, hooks) from GitHub repositories and local folders. It provides workspace initialization, MCP (Model Context Protocol) server configuration, AI-generated commit messages, template profiles, and automated extension self-updates.

**Repository:** [NexusInnovation/nexus-nexkit-vscode](https://github.com/NexusInnovation/nexus-nexkit-vscode)
**License:** MIT
**Current Version:** 3.7.0-beta.12

## Purpose and Problem Statement

Nexkit solves the challenge of discovering, installing, and managing AI template files (`.agent.md`, `.prompt.md`, `.instructions.md`, etc.) across development teams. Without Nexkit, developers must manually copy template files into their workspaces and keep them in sync with upstream repositories.

### Key Capabilities

| Capability                   | Description                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Template Management**      | Browse, install, and update AI templates from multiple GitHub repositories or local folders          |
| **Profile System**           | Save and apply named collections of templates for quick workspace reconfiguration                    |
| **MCP Server Configuration** | Automatic setup of required MCP servers (Context7, Sequential Thinking) at user and workspace levels |
| **Workspace Initialization** | One-click workspace setup: `.gitignore`, recommended extensions, settings, MCP config                |
| **AI Commit Messages**       | Generate Conventional Commits messages from staged git diffs using VS Code Language Model API        |
| **Extension Self-Update**    | Automatic update checks against GitHub Releases, with in-place VSIX installation                     |
| **Azure DevOps Integration** | APM mode with DevOps connection management and specialized templates                                 |
| **GitHub Workflow Runner**   | Trigger GitHub Actions workflows directly from the sidebar                                           |

## Operation Modes

Nexkit supports two operation modes selectable at first activation:

- **Developer Mode** (default): Full feature set — templates, profiles, repositories, actions
- **APM Mode**: Streamlined for Application Performance Management — optimized templates and DevOps connections

## Technology Stack Summary

| Category      | Technology                  | Version                           |
| ------------- | --------------------------- | --------------------------------- |
| Language      | TypeScript                  | 5.9.x (strict mode)               |
| Target        | ES2022                      | CommonJS modules                  |
| Extension API | VS Code Extension API       | ^1.105.0                          |
| UI Framework  | Preact                      | 10.25.x                           |
| Bundler       | esbuild                     | 0.27.x                            |
| Testing       | Mocha + Sinon               | Mocha 10.x, Sinon 19.x            |
| Coverage      | nyc                         | 15.x (lcov + text)                |
| Linting       | ESLint + @typescript-eslint | ESLint 9.x                        |
| Formatting    | Prettier                    | 3.7.x                             |
| Git Hooks     | Lefthook                    | 2.x (commitlint + pretest)        |
| Versioning    | semantic-release            | 25.x (Conventional Commits)       |
| CI/CD         | GitHub Actions              | Multi-OS (Ubuntu, Windows, macOS) |
| Telemetry     | Azure Application Insights  | 2.9.x                             |
| Security      | npm audit + CycloneDX SBOM  | Per CI pipeline                   |

## Architecture Type

**Service-oriented monolith** with dependency injection via `ServiceContainer`. The extension host runs 27+ services that communicate with a Preact webview sidebar through a message-passing protocol.

## Repository Structure

**Type:** Monolith (single VS Code extension)
**Entry Point:** `src/extension.ts` → `out/extension.js`
**Webview Entry:** `src/features/panel-ui/webview/main.tsx` → `out/webview.js`

### Feature Count

- **11 feature modules** under `src/features/`
- **27 services** registered in `ServiceContainer`
- **16+ commands** registered in extension activation
- **31 test files** under `test/suite/`

## Links to Detailed Documentation

- [Architecture](./architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Component Inventory](./component-inventory.md)
- [Development Guide](./development-guide.md)
- [Index (master navigation)](./index.md)
