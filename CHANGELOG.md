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

**Note**: Starting from the next release, versions will be automatically managed by semantic-release based on conventional commits.
