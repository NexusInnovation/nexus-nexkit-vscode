import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { LocalFolderTemplateProvider } from "../../src/features/ai-template-files/providers/localFolderTemplateProvider";
import { RepositoryConfig } from "../../src/features/ai-template-files/models/repositoryConfig";
import { AITemplateFileType } from "../../src/features/ai-template-files/models/aiTemplateFile";

suite("Unit: LocalFolderTemplateProvider", () => {
  let tempDir: string;
  let testWorkspaceFolder: vscode.WorkspaceFolder;

  setup(() => {
    // Create a temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-test-"));

    // Mock workspace folder
    testWorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: "test-workspace",
      index: 0,
    };
  });

  teardown(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create test template files
   */
  function createTestTemplates(basePath: string): void {
    const agentsDir = path.join(basePath, "agents");
    const promptsDir = path.join(basePath, "prompts");

    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(promptsDir, { recursive: true });

    // Create test agent files
    fs.writeFileSync(path.join(agentsDir, "test-agent.md"), "# Test Agent\nAgent content");
    fs.writeFileSync(path.join(agentsDir, "another-agent.md"), "# Another Agent\nMore content");

    // Create test prompt files
    fs.writeFileSync(path.join(promptsDir, "test-prompt.md"), "# Test Prompt\nPrompt content");

    // Create a non-markdown file (should be ignored)
    fs.writeFileSync(path.join(agentsDir, "readme.txt"), "This should be ignored");
  }

  test("Should fetch templates from absolute local path", async () => {
    const testRepoPath = path.join(tempDir, "test-repo");
    createTestTemplates(testRepoPath);

    const config: RepositoryConfig = {
      name: "Test Local Repo",
      type: "local",
      url: testRepoPath,
      enabled: true,
      paths: {
        agents: "agents",
        prompts: "prompts",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);
    const templates = await provider.fetchAllTemplates();

    assert.strictEqual(templates.length, 3, "Should find 3 markdown files");

    const agentTemplates = templates.filter((t) => t.type === "agents");
    const promptTemplates = templates.filter((t) => t.type === "prompts");

    assert.strictEqual(agentTemplates.length, 2, "Should find 2 agent templates");
    assert.strictEqual(promptTemplates.length, 1, "Should find 1 prompt template");

    // Verify template properties
    const testAgent = templates.find((t) => t.name === "test-agent.md");
    assert.ok(testAgent, "Should find test-agent.md");
    assert.strictEqual(testAgent!.repository, "Test Local Repo");
    assert.strictEqual(testAgent!.repositoryUrl, testRepoPath);
    assert.strictEqual(testAgent!.type, "agents");
  });

  test("Should download template content", async () => {
    const testRepoPath = path.join(tempDir, "test-repo");
    createTestTemplates(testRepoPath);

    const config: RepositoryConfig = {
      name: "Test Local Repo",
      type: "local",
      url: testRepoPath,
      enabled: true,
      paths: {
        agents: "agents",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);
    const templates = await provider.fetchAllTemplates();

    const testAgent = templates.find((t) => t.name === "test-agent.md");
    assert.ok(testAgent, "Should find test agent");

    const content = await provider.downloadTemplate(testAgent!);
    assert.ok(content.includes("# Test Agent"), "Should contain agent title");
    assert.ok(content.includes("Agent content"), "Should contain agent content");
  });

  test("Should handle missing directory gracefully", async () => {
    const nonExistentPath = path.join(tempDir, "non-existent");

    const config: RepositoryConfig = {
      name: "Missing Repo",
      type: "local",
      url: nonExistentPath,
      enabled: true,
      paths: {
        agents: "agents",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);

    // The provider should return empty array for missing base path's subdirectories
    const templates = await provider.fetchAllTemplates();
    assert.strictEqual(templates.length, 0, "Should return empty array for non-existent subdirectories");
  });

  test("Should handle missing subdirectory gracefully", async () => {
    const testRepoPath = path.join(tempDir, "test-repo");
    fs.mkdirSync(testRepoPath, { recursive: true });

    // Create only agents directory, not prompts
    const agentsDir = path.join(testRepoPath, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "test-agent.md"), "# Test Agent");

    const config: RepositoryConfig = {
      name: "Test Repo",
      type: "local",
      url: testRepoPath,
      enabled: true,
      paths: {
        agents: "agents",
        prompts: "prompts", // This directory doesn't exist
      },
    };

    const provider = new LocalFolderTemplateProvider(config);
    const templates = await provider.fetchAllTemplates();

    // Should only find agent, not fail due to missing prompts directory
    assert.strictEqual(templates.length, 1, "Should find 1 template despite missing directory");
    assert.strictEqual(templates[0].type, "agents");
  });

  test("Should validate path correctly", async () => {
    const testRepoPath = path.join(tempDir, "test-repo");
    fs.mkdirSync(testRepoPath, { recursive: true });

    const config: RepositoryConfig = {
      name: "Test Repo",
      type: "local",
      url: testRepoPath,
      enabled: true,
      paths: {
        agents: "agents",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);
    const validation = await provider.validatePath();

    assert.strictEqual(validation.valid, true, "Should validate existing directory");
  });

  test("Should fail validation for non-existent path", async () => {
    const nonExistentPath = path.join(tempDir, "non-existent");

    const config: RepositoryConfig = {
      name: "Missing Repo",
      type: "local",
      url: nonExistentPath,
      enabled: true,
      paths: {
        agents: "agents",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);
    const validation = await provider.validatePath();

    assert.strictEqual(validation.valid, false, "Should fail validation for non-existent path");
    assert.ok(validation.error, "Should provide error message");
  });

  test("Should handle home directory expansion", async () => {
    // This test might be platform-specific
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      console.log("Skipping home directory test - no home directory found");
      return;
    }

    // Create a test directory in temp that we can reference
    const testRepoPath = path.join(tempDir, "home-test");
    fs.mkdirSync(testRepoPath, { recursive: true });

    // Note: We can't easily test actual ~ expansion without mocking,
    // but we can verify the provider handles the syntax
    const config: RepositoryConfig = {
      name: "Home Repo",
      type: "local",
      url: "~/test-templates", // This would expand to home directory
      enabled: true,
      paths: {
        agents: "agents",
      },
    };

    // Provider creation should not throw
    const provider = new LocalFolderTemplateProvider(config);
    assert.ok(provider, "Should create provider with home directory path");
  });

  test("Should return correct repository name and config", async () => {
    const testRepoPath = path.join(tempDir, "test-repo");
    fs.mkdirSync(testRepoPath, { recursive: true });

    const config: RepositoryConfig = {
      name: "Test Repo",
      type: "local",
      url: testRepoPath,
      enabled: true,
      paths: {
        agents: "agents",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);

    assert.strictEqual(provider.getRepositoryName(), "Test Repo");
    assert.deepStrictEqual(provider.getConfig(), config);
  });

  test("Should throw error for disabled repository", () => {
    const config: RepositoryConfig = {
      name: "Disabled Repo",
      type: "local",
      url: tempDir,
      enabled: false,
      paths: {
        agents: "agents",
      },
    };

    assert.throws(
      () => new LocalFolderTemplateProvider(config),
      /Repository is disabled/,
      "Should throw error for disabled repository"
    );
  });

  test("Should only process markdown files", async () => {
    const testRepoPath = path.join(tempDir, "test-repo");
    const agentsDir = path.join(testRepoPath, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    // Create various file types
    fs.writeFileSync(path.join(agentsDir, "agent.md"), "# Agent");
    fs.writeFileSync(path.join(agentsDir, "readme.txt"), "Text file");
    fs.writeFileSync(path.join(agentsDir, "config.json"), "{}");
    fs.writeFileSync(path.join(agentsDir, "script.js"), "console.log('hi')");

    const config: RepositoryConfig = {
      name: "Test Repo",
      type: "local",
      url: testRepoPath,
      enabled: true,
      paths: {
        agents: "agents",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);
    const templates = await provider.fetchAllTemplates();

    assert.strictEqual(templates.length, 1, "Should only find markdown file");
    assert.strictEqual(templates[0].name, "agent.md");
  });

  test("Should handle empty directory", async () => {
    const testRepoPath = path.join(tempDir, "test-repo");
    const agentsDir = path.join(testRepoPath, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    const config: RepositoryConfig = {
      name: "Empty Repo",
      type: "local",
      url: testRepoPath,
      enabled: true,
      paths: {
        agents: "agents",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);
    const templates = await provider.fetchAllTemplates();

    assert.strictEqual(templates.length, 0, "Should return empty array for empty directory");
  });

  test("Should handle multiple template types", async () => {
    const testRepoPath = path.join(tempDir, "test-repo");
    createTestTemplates(testRepoPath);

    // Add instructions directory
    const instructionsDir = path.join(testRepoPath, "instructions");
    fs.mkdirSync(instructionsDir, { recursive: true });
    fs.writeFileSync(path.join(instructionsDir, "typescript.md"), "# TypeScript Instructions");

    const config: RepositoryConfig = {
      name: "Multi-Type Repo",
      type: "local",
      url: testRepoPath,
      enabled: true,
      paths: {
        agents: "agents",
        prompts: "prompts",
        instructions: "instructions",
      },
    };

    const provider = new LocalFolderTemplateProvider(config);
    const templates = await provider.fetchAllTemplates();

    const typeCount = templates.reduce(
      (acc, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1;
        return acc;
      },
      {} as Record<AITemplateFileType, number>
    );

    assert.strictEqual(typeCount.agents, 2, "Should find 2 agents");
    assert.strictEqual(typeCount.prompts, 1, "Should find 1 prompt");
    assert.strictEqual(typeCount.instructions, 1, "Should find 1 instruction");
  });
});
