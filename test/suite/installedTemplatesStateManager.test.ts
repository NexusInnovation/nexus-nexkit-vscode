/**
 * Tests for InstalledTemplatesStateManager
 * State manager for tracking installed templates
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { InstalledTemplatesStateManager } from "../../src/features/ai-template-files/services/installedTemplatesStateManager";
import { AITemplateFile } from "../../src/features/ai-template-files/models/aiTemplateFile";

suite("Unit: InstalledTemplatesStateManager", () => {
  let stateManager: InstalledTemplatesStateManager;
  let mockContext: vscode.ExtensionContext;
  let mockState: Map<string, any>;

  setup(() => {
    // Create mock workspace state
    mockState = new Map();

    mockContext = {
      workspaceState: {
        get: (key: string) => mockState.get(key),
        update: async (key: string, value: any) => {
          mockState.set(key, value);
        },
      },
    } as any;

    stateManager = new InstalledTemplatesStateManager(mockContext);
  });

  test("Should instantiate InstalledTemplatesStateManager", () => {
    assert.ok(stateManager);
  });

  test("Should return empty array for initial state", () => {
    const templates = stateManager.getInstalledTemplates();
    assert.ok(Array.isArray(templates));
    assert.strictEqual(templates.length, 0);
  });

  test("Should add installed template to state", async () => {
    const template: AITemplateFile = {
      name: "test.agent.md",
      type: "agents",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
      rawUrl: "https://raw.githubusercontent.com/test/repo/main/agents/test.agent.md",
    };

    await stateManager.addInstalledTemplate(template);

    const installed = stateManager.getInstalledTemplates();
    assert.strictEqual(installed.length, 1);
    assert.strictEqual(installed[0].name, "test.agent.md");
    assert.strictEqual(installed[0].type, "agents");
    assert.strictEqual(installed[0].repository, "test-repo");
  });

  test("Should remove installed template from state", async () => {
    const template: AITemplateFile = {
      name: "test.agent.md",
      type: "agents",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
      rawUrl: "https://raw.githubusercontent.com/test/repo/main/agents/test.agent.md",
    };

    await stateManager.addInstalledTemplate(template);
    assert.strictEqual(stateManager.getInstalledTemplates().length, 1);

    await stateManager.removeInstalledTemplate(template);
    assert.strictEqual(stateManager.getInstalledTemplates().length, 0);
  });

  test("Should check if template is installed", async () => {
    const template: AITemplateFile = {
      name: "test.agent.md",
      type: "agents",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
      rawUrl: "https://raw.githubusercontent.com/test/repo/main/agents/test.agent.md",
    };

    assert.strictEqual(stateManager.isTemplateInstalled(template), false);

    await stateManager.addInstalledTemplate(template);
    assert.strictEqual(stateManager.isTemplateInstalled(template), true);

    await stateManager.removeInstalledTemplate(template);
    assert.strictEqual(stateManager.isTemplateInstalled(template), false);
  });

  test("Should distinguish templates from different repositories", async () => {
    const template1: AITemplateFile = {
      name: "test.agent.md",
      type: "agents",
      repository: "repo1",
      repositoryUrl: "https://github.com/test/repo1",
      rawUrl: "https://raw.githubusercontent.com/test/repo1/main/agents/test.agent.md",
    };

    const template2: AITemplateFile = {
      name: "test.agent.md",
      type: "agents",
      repository: "repo2",
      repositoryUrl: "https://github.com/test/repo2",
      rawUrl: "https://raw.githubusercontent.com/test/repo2/main/agents/test.agent.md",
    };

    await stateManager.addInstalledTemplate(template1);
    await stateManager.addInstalledTemplate(template2);

    assert.strictEqual(stateManager.isTemplateInstalled(template1), true);
    assert.strictEqual(stateManager.isTemplateInstalled(template2), true);

    const installed = stateManager.getInstalledTemplates();
    assert.strictEqual(installed.length, 2);
  });

  test("Should return installed templates map organized by type", async () => {
    const agent: AITemplateFile = {
      name: "test.agent.md",
      type: "agents",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
      rawUrl: "https://raw.githubusercontent.com/test/repo/main/agents/test.agent.md",
    };

    const prompt: AITemplateFile = {
      name: "test.prompt.md",
      type: "prompts",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
      rawUrl: "https://raw.githubusercontent.com/test/repo/main/prompts/test.prompt.md",
    };

    await stateManager.addInstalledTemplate(agent);
    await stateManager.addInstalledTemplate(prompt);

    const map = stateManager.getInstalledTemplatesMap();

    assert.ok(map.agents.includes("test.agent.md"));
    assert.ok(map.prompts.includes("test.prompt.md"));
    assert.strictEqual(map.instructions.length, 0);
    assert.strictEqual(map.chatmodes.length, 0);
  });

  test("Should clear all state", async () => {
    const template: AITemplateFile = {
      name: "test.agent.md",
      type: "agents",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
      rawUrl: "https://raw.githubusercontent.com/test/repo/main/agents/test.agent.md",
    };

    await stateManager.addInstalledTemplate(template);
    assert.strictEqual(stateManager.getInstalledTemplates().length, 1);

    await stateManager.clearState();
    assert.strictEqual(stateManager.getInstalledTemplates().length, 0);
  });

  test("Should update existing template record when adding same template", async () => {
    const template: AITemplateFile = {
      name: "test.agent.md",
      type: "agents",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
      rawUrl: "https://raw.githubusercontent.com/test/repo/main/agents/test.agent.md",
    };

    await stateManager.addInstalledTemplate(template);
    const firstInstall = stateManager.getInstalledTemplates()[0];
    const firstTimestamp = firstInstall.installedAt;

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    await stateManager.addInstalledTemplate(template);
    const secondInstall = stateManager.getInstalledTemplates()[0];
    const secondTimestamp = secondInstall.installedAt;

    // Should only have one record
    assert.strictEqual(stateManager.getInstalledTemplates().length, 1);
    // Timestamp should be updated
    assert.ok(secondTimestamp >= firstTimestamp);
  });
});
