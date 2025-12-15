# Releasing Nexkit (automated)

This repository uses **Semantic Versioning** and **Conventional Commits**.
Releases are fully automated by **semantic-release** in GitHub Actions.

## How versions are chosen

Semantic-release computes the next version from commit messages merged into the release branches.

- `fix:` / `perf:` / `revert:` → patch bump
- `feat:` → minor bump
- `!` in the type/scope (example: `feat!:`) or a `BREAKING CHANGE:` footer → major bump

## Release branches

- `main` produces **stable** releases: `vX.Y.Z`
- `develop` produces **beta** pre-releases: `vX.Y.Z-beta.N`

## How a release is published

1. Merge PRs into `main` (stable) or `develop` (beta).
2. The CI workflow runs tests, linting and security checks.
3. If the push is on a release branch, GitHub Actions runs `semantic-release` which:
   - calculates the next version
   - updates `CHANGELOG.md` and `package.json` / `package-lock.json`
   - creates and pushes the git tag `vX.Y.Z` (or `vX.Y.Z-beta.N`)
   - packages the extension into `nexkit-vscode.vsix`
   - generates an SBOM at `sbom/manifest.json`
   - creates a GitHub Release and uploads the assets

## Notes

- Version files are committed by a bot commit with `[skip ci]` to avoid release loops.
- Do **not** manually bump `package.json` version in PRs.
- Do **not** manually create `v*` tags; semantic-release handles tagging.
