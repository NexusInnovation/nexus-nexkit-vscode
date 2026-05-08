# Livingston — History

## Core Context

- **Project:** A TypeScript VS Code extension with a Preact sidebar that manages AI templates, workspace setup, MCP configuration, and self-updates.
- **Role:** QA Engineer
- **Joined:** 2026-05-07T15:47:16.740Z

## Learnings

<!-- Append learnings below -->

### 2026-05-07: User Directory Tests & Documentation (Issue #147)
- Created `test/suite/userDirectoryIntegration.test.ts` — 11 integration tests covering the full user directory flow: fresh install, workspace override, edge cases (idempotency, path consistency, backup dir).
- Test count went from 302 → 323 passing (all green, 8 pending unrelated).
- Existing unit tests (userDirectoryService, templateFileOperationsUserDir, startupVerificationService, recommendedSettingsConfigDeployer) already covered the core services well — Rusty and Basher did solid work.
- Updated `README.md` with: platform-specific path table, user vs workspace mode explanation, migration guide for existing users, updated command description.
- Key pattern: `SettingsManager.isUserDeployMode()` gates all workspace-modifying behavior. Tests stub this.
- `UserDirectoryService` is a pure path-resolution service — easy to test by stubbing `os.platform()` and `os.homedir()`.
- Integration tests use temp directories (`fs.mkdtempSync`) and clean up in teardown — safe for CI.
