/**
 * Tests for TestCommandResolverService
 * Resolves the appropriate test command for a given project type.
 */

import * as assert from "assert";
import { TestCommandResolverService } from "../../src/features/initialization/testCommandResolverService";

suite("Unit: TestCommandResolverService", () => {
  let service: TestCommandResolverService;

  setup(() => {
    service = new TestCommandResolverService();
  });

  test("Should instantiate TestCommandResolverService", () => {
    assert.ok(service);
  });

  test("Should resolve npm test for nodejs", () => {
    const command = service.resolveTestCommand("nodejs");

    assert.strictEqual(command.bash, "npm test");
    assert.strictEqual(command.powershell, "npm test");
    assert.ok(command.timeoutSec > 0);
  });

  test("Should resolve dotnet test for dotnet", () => {
    const command = service.resolveTestCommand("dotnet");

    assert.strictEqual(command.bash, "dotnet test");
    assert.strictEqual(command.powershell, "dotnet test");
    assert.strictEqual(command.timeoutSec, 180);
  });

  test("Should resolve pytest for python", () => {
    const command = service.resolveTestCommand("python");

    assert.strictEqual(command.bash, "pytest");
    assert.strictEqual(command.powershell, "pytest");
  });

  test("Should return fallback for unknown project type", () => {
    const command = service.resolveTestCommand("unknown");

    assert.ok(command.bash);
    assert.ok(command.powershell);
    assert.ok(command.timeoutSec > 0);
  });
});
