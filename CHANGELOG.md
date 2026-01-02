## <small>1.1.1 (2026-01-02)</small>

* fix: fix auto update package installation ([f0724df](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/f0724df))

## 1.1.0 (2026-01-02)

* feat: add hover tooltip on templates (#48) ([ac25091](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/ac25091)), closes [#48](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/48)

## 1.0.0 (2025-12-30)

* BREAKING CHANGE: [v1.0] Complete refactor ([7e487ba](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/7e487ba))
* feat!: [v1.0] Refonte de l'extension et amélioration globale (#45) ([931f03e](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/931f03e)), closes [#45](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/45)
* feat!: [v1.0] Refonte de l'extension et amélioration globale (#47) ([2757937](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/2757937)), closes [#47](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/47)
* feat!: complete v1.0 refactor ([3e740b9](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/3e740b9))


### BREAKING CHANGE

* Major refactor of the entire extension with new features and breaking changes.
- Cleanup of old unused files
- Template management via GitHub repositories
- Preact-based frontend
- Improved features and tests

## 0.7.0-beta.2 (2025-12-29)

* fix: build webview ([fa885de](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/fa885de))

## 0.7.0-beta.1 (2025-12-29)

* feat: complete refactor ([9b24c3a](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/9b24c3a))

## 0.6.0 (2025-12-16)

* Merge pull request #42 from NexusInnovation/feature/test-ci-minor-version-bump ([7c0165a](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/7c0165a)), closes [#42](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/42)
* feat(ci): Update .gitignore and test minor version bump ([96dcdea](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/96dcdea))

## <small>0.5.5 (2025-12-15)</small>

* Merge branch 'chore/semantic-release-ci' of https://github.com/NexusInnovation/nexus-nexkit-vscode i ([364d1a0](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/364d1a0))
* Merge branch 'main' into chore/semantic-release-ci ([f32b0ab](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/f32b0ab))
* Merge pull request #37 from NexusInnovation/repo-rename-nexus-nexkit-vscode ([aae4080](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/aae4080)), closes [#37](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/37)
* Merge pull request #38 from NexusInnovation:chore/semantic-release-ci ([31ae0a3](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/31ae0a3)), closes [#38](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/38)
* Merge pull request #39 from NexusInnovation/chore/semantic-release-ci ([667cad9](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/667cad9)), closes [#39](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/39)
* Merge pull request #40 from NexusInnovation/chore/semantic-release-ci ([b2d782c](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/b2d782c)), closes [#40](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/40)
* Merge pull request #41 from NexusInnovation/fix/refactor ([79e1d5a](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/79e1d5a)), closes [#41](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/41)
* refactor: centralize Nexkit extension version retrieval ([c0b0c82](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/c0b0c82))
* refactor: Update repository references from 'nexkit-vscode' to 'nexus-nexkit-vscode' ([deedfcb](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/deedfcb))
* fix: correct publisher name and repository URL for consistency ([9acc28e](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/9acc28e))
* fix: rename extension and update user agent for consistency ([7a613b3](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/7a613b3))
* chore(ci): run semantic-release on main/develop ([507fa90](https://github.com/NexusInnovation/nexus-nexkit-vscode/commit/507fa90))

# Changelog

All notable changes to the Nexkit VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive CI/CD pipeline with multi-platform testing (Ubuntu, Windows, macOS)
- Automated semantic versioning and changelog generation
- Security scanning (npm audit, CodeQL, SBOM generation)
- Dependency automation via Dependabot
- Build optimization with esbuild bundling (27KB minified output)
- Code coverage reporting with nyc (70% threshold for core services)
- Conventional Commits enforcement via commitlint workflow
- Enhanced test infrastructure with @vscode/test-electron
- Comprehensive documentation (CONTRIBUTING.md, PR template)
- GitHub release automation with VSIX and SBOM attachments
- Bundle size monitoring with 512KB regression warnings
- Pre-release support (alpha, beta, RC versions)
- Stable "latest" release download link

### Changed

- Migrated from manual versioning to automated semantic-release
- Updated build process to use esbuild for production bundles
- Enhanced .vscodeignore to exclude development/CI files from package
- Improved README with installation instructions and CI/CD badges
- Reorganized test structure with suite/ directory
- Disabled legacy release.yml workflow in favor of ci-cd.yml

### Fixed

- Removed `|| true` bypass from linting step in CI pipeline
- Fixed test runner configuration for headless VS Code execution
- Improved extension activation tests for all registered commands

### Security

- Added npm audit with high/critical vulnerability blocking
- Implemented CodeQL security scanning
- Enabled SBOM generation for supply chain security
- Configured Dependabot for automated security updates

## [0.1.2] - Previous Release

Initial release with template deployment, MCP configuration, version management, and basic CI/CD.

---

**Note**: Versions are managed automatically by semantic-release based on Conventional Commits (see `docs/RELEASING.md`).
