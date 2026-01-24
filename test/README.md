# Nexkit VS Code Extension Tests

This directory contains tests for the Nexkit VS Code extension.

## Test Structure

```
test/
├── runTest.ts              # Test runner configuration
└── suite/                  # Test suites
    ├── index.ts           # Mocha configuration
    ├── serviceContainer.test.ts
    ├── settingsManager.test.ts
    ├── telemetryService.test.ts
    ├── aiTemplateDataService.test.ts
    ├── repositoryManager.test.ts
    ├── mcpConfigService.test.ts
    ├── extensionUpdateService.test.ts
    └── backupService.test.ts
```

## Running Tests

```bash
# Compile and run all tests
npm test

# Run only unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Test Organization

Tests are organized by feature/service:

### Core Services

- **serviceContainer.test.ts**: Dependency injection container tests
- **settingsManager.test.ts**: Configuration management tests
- **telemetryService.test.ts**: Telemetry service tests

### AI Template Features

- **aiTemplateDataService.test.ts**: Template data management tests
- **repositoryManager.test.ts**: Repository configuration tests

### MCP & Updates

- **mcpConfigService.test.ts**: MCP server configuration tests
- **extensionUpdateService.test.ts**: Extension update checking tests
- **backupService.test.ts**: Backup/restore functionality tests

## Test Conventions

- Use **Unit:** prefix for isolated unit tests
- Use **Integration:** prefix for tests that interact with external systems
- Mock VS Code API and external dependencies where appropriate
- Tests should be independent and not rely on execution order
- Clean up resources in `teardown()` hooks

## Writing New Tests

1. Create a new test file in `test/suite/`
2. Import the service/module to test
3. Use Mocha's `suite()` and `test()` functions
4. Use Node's `assert` module for assertions
5. Use `sinon` for mocking when needed

Example:

```typescript
import * as assert from "assert";
import { MyService } from "../../src/features/my-feature/myService";

suite("Unit: MyService", () => {
  let service: MyService;

  setup(() => {
    service = new MyService();
  });

  teardown(() => {
    // Clean up
  });

  test("Should do something", () => {
    const result = service.doSomething();
    assert.ok(result);
  });
});
```

## Notes

- Tests run in a headless VS Code environment
- Network-dependent tests (e.g., GitHub API) should handle failures gracefully
- Use appropriate timeouts for async operations
- The old `src/test` folder is excluded from compilation

## GitHub Authentication for Tests

The test runner automatically handles GitHub authentication using a hybrid approach:

### Local Development (Automatic)

When running `npm test` on your development machine:

- ✅ GitHub authentication is automatically copied from your VS Code profile
- ✅ No configuration needed - just be signed into GitHub in VS Code
- ✅ Works with VS Code Stable, Insiders, or OSS variants
- ℹ️ If no authentication is found, tests run without authentication (public repos only)

**Supported VS Code Variants:**

- VS Code Stable: `Code`
- VS Code Insiders: `Code - Insiders`
- VS Code OSS: `Code - OSS`

**How it works:**

The test runner copies GitHub authentication data from your VS Code user profile to the test instance:

- **Windows**: `%APPDATA%\Code\User\globalStorage\vscode.github-authentication`
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/vscode.github-authentication`
- **Linux**: `~/.config/Code/User/globalStorage/vscode.github-authentication`

### CI/CD (Environment Variable)

GitHub Actions and other CI systems automatically provide authentication via the `GITHUB_TOKEN` environment variable:

```yaml
# .github/workflows/ci-cd.yml (already configured)
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For other CI systems, set the `GITHUB_TOKEN` or `GH_TOKEN` environment variable:

```bash
# Azure Pipelines, Jenkins, etc.
export GITHUB_TOKEN=ghp_your_token_here
npm test
```

### Manual Token Setup (Optional)

You can override automatic authentication with an environment variable:

```bash
# Windows PowerShell
$env:GITHUB_TOKEN="ghp_your_token_here"
npm test

# Windows CMD
set GITHUB_TOKEN=ghp_your_token_here
npm test

# macOS/Linux
export GITHUB_TOKEN=ghp_your_token_here
npm test
```

### Skip Authentication Copy

To disable automatic authentication copy (e.g., for testing unauthenticated scenarios):

```bash
# Windows PowerShell
$env:SKIP_AUTH_COPY="true"
npm test

# macOS/Linux
export SKIP_AUTH_COPY=true
npm test
```

### Authentication Priority

The authentication system uses the following priority order:

1. **Environment Token** (`GITHUB_TOKEN` or `GH_TOKEN`) - Highest priority
2. **VS Code Session** (copied from user profile or available in test instance)
3. **No Authentication** (graceful degradation for public repos)

### Troubleshooting

**Tests fail with authentication errors:**

- Ensure you're signed into GitHub in VS Code (`Ctrl+Shift+P` → "GitHub: Sign In")
- Check test output for authentication setup messages
- Try setting `GITHUB_TOKEN` manually for debugging

**Authentication copy fails:**

- Verify VS Code GitHub extension is installed and authenticated
- Check file permissions on VS Code user data directory
- Review console output for specific error messages

**Private repository access fails:**

- Ensure your GitHub account has access to the repository
- Verify token has `repo` scope (environment tokens)
- Check that authentication was successfully copied (see test output)
