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
