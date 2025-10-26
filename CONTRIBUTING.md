# Contributing to Nexkit VS Code Extension

Thank you for your interest in contributing to the Nexkit VS Code Extension! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

This project adheres to professional standards of collaboration. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- VS Code 1.105.0 or higher
- Git

### Setup Development Environment

1. **Clone the repository**

   ```bash
   git clone https://github.com/NexusInnovation/nexkit-vscode.git
   cd nexkit-vscode
   ```

2. **Install dependencies**

   ```bash
   npm ci
   ```

3. **Build the extension**

   ```bash
   npm run compile
   ```

4. **Run tests**

   ```bash
   npm test
   ```

5. **Launch development host**
   - Press `F5` in VS Code to open an Extension Development Host
   - Test your changes in the spawned VS Code instance

## Development Workflow

### Project Structure

```
nexkit-vscode/
├── .github/
│   ├── workflows/          # CI/CD pipelines
│   ├── dependabot.yml      # Dependency automation
│   └── PULL_REQUEST_TEMPLATE.md
├── src/
│   ├── extension.ts        # Main extension entry point
│   ├── templateManager.ts  # Template deployment logic
│   ├── mcpConfigManager.ts # MCP configuration
│   ├── versionManager.ts   # Version checking
│   └── test/              # Test suite
├── resources/
│   └── templates/         # Template files
├── esbuild.config.js      # Build configuration
├── package.json
└── tsconfig.json
```

### Available Scripts

- **`npm run compile`** - Compile TypeScript without bundling
- **`npm run watch`** - Watch mode for TypeScript compilation
- **`npm run package`** - Build optimized production bundle
- **`npm run esbuild`** - Build with esbuild (development)
- **`npm run esbuild-watch`** - Watch mode with esbuild
- **`npm run lint`** - Run ESLint
- **`npm run check:types`** - Type checking without emit
- **`npm test`** - Run all tests
- **`npm run test:unit`** - Run unit tests only
- **`npm run test:coverage`** - Run tests with coverage report

### Making Changes

1. **Create a feature branch**

   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes**

   - Follow TypeScript and VS Code extension best practices
   - Write tests for new functionality
   - Update documentation as needed

3. **Run quality checks**

   ```bash
   npm run check:types
   npm run lint
   npm test
   ```

4. **Commit your changes**
   - Follow [Conventional Commits](#commit-message-guidelines) format
   - Write clear, descriptive commit messages

## Commit Message Guidelines

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation.

### Commit Message Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- **feat**: A new feature (triggers minor version bump)
- **fix**: A bug fix (triggers patch version bump)
- **docs**: Documentation only changes
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks, dependency updates
- **ci**: CI/CD configuration changes
- **build**: Build system or tooling changes

### Scopes (Optional but Recommended)

- `templates` - Template deployment and management
- `mcp` - MCP server configuration
- `wizard` - Initialization wizard
- `panel` - Webview panel
- `version` - Version management
- `deps` - Dependency updates
- `ci` - CI/CD changes

### Examples

```bash
# Feature
feat(templates): add support for Go language templates

# Bug fix
fix(mcp): resolve config path resolution on macOS

# Documentation
docs: update installation instructions

# Breaking change
feat(api)!: change template deployment interface

BREAKING CHANGE: Template deployment now requires explicit language selection
```

### Validation

Commit messages are validated automatically:

- **Locally**: Install commit hooks with `npm install` (if Husky is configured)
- **On PR**: Commitlint workflow validates all commits in pull requests

## Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage
npm run test:coverage
```

### Writing Tests

- Place unit tests in `src/test/suite/`
- Prefix test suite names with `Unit:` or `Integration:`
- Use descriptive test names
- Mock external dependencies
- Aim for >70% code coverage for core services

### Test Structure

```typescript
import * as assert from "assert";
import * as vscode from "vscode";

suite("Unit: TemplateManager", () => {
  test("Should deploy templates successfully", async () => {
    // Arrange
    const manager = new TemplateManager();

    // Act
    const result = await manager.deployTemplates();

    // Assert
    assert.ok(result);
  });
});
```

## Pull Request Process

### Before Submitting

1. **Ensure all tests pass**

   ```bash
   npm test
   ```

2. **Run linter**

   ```bash
   npm run lint
   ```

3. **Build successfully**

   ```bash
   npm run package
   ```

4. **Update documentation** if needed

### Submitting a Pull Request

1. **Push your branch**

   ```bash
   git push origin feat/your-feature-name
   ```

2. **Create Pull Request** on GitHub

   - Use the PR template
   - Link related issues
   - Describe changes clearly
   - Add screenshots/videos for UI changes

3. **Address review feedback**

   - Respond to comments
   - Make requested changes
   - Push updates to the same branch

4. **Wait for CI checks**
   - All workflows must pass
   - Code coverage must meet thresholds
   - No security vulnerabilities

### PR Checklist

- [ ] My commits follow Conventional Commits format
- [ ] I have added tests for my changes
- [ ] All tests pass locally
- [ ] I have updated documentation as needed
- [ ] My code follows the project's style guidelines
- [ ] I have checked for accessibility issues
- [ ] I have tested on multiple platforms (if applicable)

## Release Process

Releases are automated using semantic-release based on commit messages.

### Versioning

- **Patch** (0.0.X): Bug fixes (`fix:` commits)
- **Minor** (0.X.0): New features (`feat:` commits)
- **Major** (X.0.0): Breaking changes (`feat!:` or `BREAKING CHANGE:` footer)

### Automated Release Flow

1. **Merge to main** - PR merged with conventional commits
2. **CI/CD runs** - Tests, linting, security scans
3. **Semantic release** - Version calculated from commits
4. **Tag created** - Git tag (e.g., `v0.2.0`)
5. **GitHub release** - Created with VSIX attachment
6. **Changelog** - Automatically generated

### Pre-release Versions

For testing before stable release:

- Alpha: `v0.2.0-alpha.1`
- Beta: `v0.2.0-beta.1`
- RC: `v0.2.0-rc.1`

Pre-releases are marked as such in GitHub releases.

### Manual Release (Emergency Only)

If automated release fails:

1. **Update version**

   ```bash
   npm version patch  # or minor/major
   ```

2. **Create tag**

   ```bash
   git push --tags
   ```

3. **Create GitHub release manually**
   - Attach VSIX file
   - Add release notes

## Code Style

- Follow TypeScript 5.x conventions
- Use ESLint configuration provided
- Prefer `async/await` over promises
- Use descriptive variable names
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Getting Help

- **Issues**: Check existing issues or create a new one
- **Discussions**: Start a discussion for questions
- **Documentation**: Review project documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Nexkit VS Code Extension! 🎉
