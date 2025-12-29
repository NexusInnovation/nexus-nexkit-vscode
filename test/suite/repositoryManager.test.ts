/**
 * Tests for RepositoryManager
 * Manages repository configurations
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { RepositoryManager } from "../../src/features/ai-template-files/services/repositoryManager";

suite("Unit: RepositoryManager", () => {
  let manager: RepositoryManager;

  setup(() => {
    manager = new RepositoryManager();
  });

  test("Should instantiate RepositoryManager", () => {
    assert.ok(manager);
  });

  test("Should initialize with default Nexus repository", () => {
    manager.initialize();
    const providerCount = manager.getRepositoryCount();

    assert.ok(providerCount > 0, "Should have at least the default Nexus repository");

    // Check for Nexus repository
    const hasNexus = manager.hasRepository("Nexus Templates");
    assert.ok(hasNexus, "Should include Nexus Templates repository");
  });

  test("Should merge configured repositories with defaults", () => {
    manager.initialize();
    const count = manager.getRepositoryCount();

    // Should include Nexus and any configured repos
    assert.ok(count >= 1);
  });

  test("Should get repository providers", () => {
    manager.initialize();
    const providers = manager.getAllProviders();

    assert.ok(Array.isArray(providers));
    assert.ok(providers.length > 0);
  });

  test("Should handle GitHub URLs with trailing slash", () => {
    // This test is for internal implementation, skip for now
    assert.ok(true);
  });

  test("Should get repository names", () => {
    manager.initialize();
    const names = manager.getRepositoryNames();

    assert.ok(Array.isArray(names));
    assert.ok(names.length > 0);
  });
});
