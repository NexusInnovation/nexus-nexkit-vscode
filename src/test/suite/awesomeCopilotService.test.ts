import * as assert from "assert";
import * as vscode from "vscode";
import { AwesomeCopilotService } from "../../awesomeCopilotService";

suite("AwesomeCopilotService Test Suite", () => {
  let service: AwesomeCopilotService;
  let context: vscode.ExtensionContext;

  setup(() => {
    // Create a mock context for testing
    context = {
      subscriptions: [],
      workspaceState: {
        get: () => undefined,
        update: async () => {},
        keys: () => [],
      },
      globalState: {
        get: () => undefined,
        update: async () => {},
        setKeysForSync: () => {},
        keys: () => [],
      },
      secrets: {} as any,
      extensionUri: vscode.Uri.file(__dirname),
      extensionPath: __dirname,
      asAbsolutePath: (relativePath: string) => relativePath,
      storagePath: undefined,
      globalStoragePath: __dirname,
      logPath: __dirname,
      extensionMode: vscode.ExtensionMode.Test,
      extension: {} as any,
      environmentVariableCollection: {} as any,
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file(__dirname),
      logUri: vscode.Uri.file(__dirname),
    } as any;

    service = new AwesomeCopilotService(context);
  });

  teardown(() => {
    service.clearCache();
  });

  test("Service should be instantiated", () => {
    assert.ok(service);
  });

  test("Should extract title from filename correctly", () => {
    // Access private method through type assertion for testing
    const extractTitle = (service as any).extractTitleFromFilename.bind(
      service
    );

    assert.strictEqual(
      extractTitle("prompt-builder.agent.md", ".agent.md"),
      "Prompt Builder"
    );
    assert.strictEqual(
      extractTitle("create-readme.prompt.md", ".prompt.md"),
      "Create Readme"
    );
    assert.strictEqual(
      extractTitle("typescript.instructions.md", ".instructions.md"),
      "Typescript"
    );
  });

  test("Should parse frontmatter correctly", () => {
    const content = `---
description: 'Test description'
tools: ['codebase', 'edit']
---

# Test Content`;

    const metadata = service.parseFrontmatter(content);
    assert.strictEqual(metadata.description, "Test description");
    assert.strictEqual(metadata.tools, "['codebase', 'edit']");
  });

  test("Should parse frontmatter without quotes", () => {
    const content = `---
description: Test description without quotes
mode: agent
---

# Test Content`;

    const metadata = service.parseFrontmatter(content);
    assert.strictEqual(metadata.description, "Test description without quotes");
    assert.strictEqual(metadata.mode, "agent");
  });

  test("Should return empty object for content without frontmatter", () => {
    const content = `# Test Content\n\nNo frontmatter here`;
    const metadata = service.parseFrontmatter(content);
    assert.deepStrictEqual(metadata, {});
  });

  // Integration tests - only run if network is available
  suite("Integration Tests (requires network)", () => {
    test("Should fetch agents from GitHub", async function () {
      this.timeout(10000); // Increase timeout for network request

      try {
        const agents = await service.fetchAgents();
        assert.ok(Array.isArray(agents));
        assert.ok(agents.length > 0, "Should fetch at least one agent");

        // Check structure of first agent
        const firstAgent = agents[0];
        assert.ok(firstAgent.name);
        assert.ok(firstAgent.title);
        assert.strictEqual(firstAgent.category, "agents");
        assert.ok(firstAgent.rawUrl);
      } catch (error) {
        // Skip test if network error
        if (
          error instanceof Error &&
          error.message.includes("Failed to fetch")
        ) {
          this.skip();
        } else {
          throw error;
        }
      }
    });

    test("Should fetch prompts from GitHub", async function () {
      this.timeout(10000);

      try {
        const prompts = await service.fetchPrompts();
        assert.ok(Array.isArray(prompts));
        assert.ok(prompts.length > 0, "Should fetch at least one prompt");

        const firstPrompt = prompts[0];
        assert.ok(firstPrompt.name);
        assert.strictEqual(firstPrompt.category, "prompts");
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Failed to fetch")
        ) {
          this.skip();
        } else {
          throw error;
        }
      }
    });

    test("Should fetch instructions from GitHub", async function () {
      this.timeout(10000);

      try {
        const instructions = await service.fetchInstructions();
        assert.ok(Array.isArray(instructions));
        assert.ok(
          instructions.length > 0,
          "Should fetch at least one instruction"
        );

        const firstInstruction = instructions[0];
        assert.ok(firstInstruction.name);
        assert.strictEqual(firstInstruction.category, "instructions");
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Failed to fetch")
        ) {
          this.skip();
        } else {
          throw error;
        }
      }
    });

    test("Should cache results", async function () {
      this.timeout(10000);

      try {
        // First fetch
        const agents1 = await service.fetchAgents();
        const startTime = Date.now();

        // Second fetch (should use cache)
        const agents2 = await service.fetchAgents();
        const endTime = Date.now();

        // Cached fetch should be very fast (< 100ms)
        const duration = endTime - startTime;
        assert.ok(
          duration < 100,
          `Cache fetch took ${duration}ms, should be < 100ms`
        );

        // Results should be identical
        assert.deepStrictEqual(agents1, agents2);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Failed to fetch")
        ) {
          this.skip();
        } else {
          throw error;
        }
      }
    });

    test("Should clear cache", async function () {
      this.timeout(10000);

      try {
        // Fetch and cache
        await service.fetchAgents();

        // Clear cache
        service.clearCache();

        // This should be a fresh fetch (not testing timing, just that it works)
        const agents = await service.fetchAgents();
        assert.ok(Array.isArray(agents));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Failed to fetch")
        ) {
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });
});
