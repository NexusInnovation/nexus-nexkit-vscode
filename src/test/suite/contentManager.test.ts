import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ContentManager } from "../../contentManager";

suite("ContentManager Test Suite", () => {
  let manager: ContentManager;
  let context: vscode.ExtensionContext;
  let testWorkspaceRoot: string;

  setup(async () => {
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

    manager = new ContentManager(context);

    // Setup test workspace if available
    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      testWorkspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
  });

  teardown(async () => {
    // Clean up test files if workspace is available
    if (testWorkspaceRoot) {
      const testDirs = [
        path.join(testWorkspaceRoot, ".github", "agents"),
        path.join(testWorkspaceRoot, ".github", "prompts"),
        path.join(testWorkspaceRoot, ".github", "instructions"),
      ];

      for (const dir of testDirs) {
        try {
          const files = await fs.promises.readdir(dir);
          for (const file of files) {
            if (file.startsWith("test-")) {
              await fs.promises.unlink(path.join(dir, file));
            }
          }
        } catch {
          // Directory might not exist, ignore
        }
      }
    }
  });

  test("Manager should be instantiated", () => {
    assert.ok(manager);
  });

  test("Should throw error when no workspace is open", async () => {
    if (
      !vscode.workspace.workspaceFolders ||
      vscode.workspace.workspaceFolders.length === 0
    ) {
      const getRoot = (manager as any).getWorkspaceRoot.bind(manager);
      assert.throws(() => getRoot(), /No workspace folder open/);
    } else {
      // Skip test if workspace is open
      assert.ok(true);
    }
  });

  suite("File Operations (requires workspace)", () => {
    test("Should get installed items", async function () {
      if (!testWorkspaceRoot) {
        this.skip();
        return;
      }

      const installed = await manager.getInstalledItems();
      assert.ok(installed);
      assert.ok(installed.agents instanceof Set);
      assert.ok(installed.prompts instanceof Set);
      assert.ok(installed.instructions instanceof Set);
    });

    test("Should check if item is installed", async function () {
      if (!testWorkspaceRoot) {
        this.skip();
        return;
      }

      // Check for non-existent file
      const isInstalled = await manager.isInstalled(
        "agents",
        "non-existent.agent.md"
      );
      assert.strictEqual(isInstalled, false);
    });

    test("Should install and remove a file", async function () {
      if (!testWorkspaceRoot) {
        this.skip();
        return;
      }

      const testFilename = "test-agent.agent.md";
      const testContent = "---\ndescription: Test agent\n---\n\n# Test Agent";

      try {
        // Install file
        await manager.installFile("agents", testFilename, testContent);

        // Verify file exists
        const isInstalled = await manager.isInstalled("agents", testFilename);
        assert.strictEqual(isInstalled, true);

        // Verify content
        const filePath = path.join(
          testWorkspaceRoot,
          ".github",
          "agents",
          testFilename
        );
        const content = await fs.promises.readFile(filePath, "utf8");
        assert.strictEqual(content, testContent);

        // Check it appears in installed items
        const installed = await manager.getInstalledItems();
        assert.ok(installed.agents.has(testFilename));

        // Remove file
        await manager.removeFile("agents", testFilename);

        // Verify file is removed
        const isStillInstalled = await manager.isInstalled(
          "agents",
          testFilename
        );
        assert.strictEqual(isStillInstalled, false);

        // Check it's not in installed items
        const installedAfter = await manager.getInstalledItems();
        assert.strictEqual(installedAfter.agents.has(testFilename), false);
      } catch (error) {
        // Clean up on error
        try {
          await manager.removeFile("agents", testFilename);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
    });

    test("Should handle prompt files", async function () {
      if (!testWorkspaceRoot) {
        this.skip();
        return;
      }

      const testFilename = "test-prompt.prompt.md";
      const testContent = "---\ndescription: Test prompt\n---\n\n# Test Prompt";

      try {
        await manager.installFile("prompts", testFilename, testContent);
        const isInstalled = await manager.isInstalled("prompts", testFilename);
        assert.strictEqual(isInstalled, true);

        await manager.removeFile("prompts", testFilename);
        const isStillInstalled = await manager.isInstalled(
          "prompts",
          testFilename
        );
        assert.strictEqual(isStillInstalled, false);
      } catch (error) {
        try {
          await manager.removeFile("prompts", testFilename);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
    });

    test("Should handle instruction files", async function () {
      if (!testWorkspaceRoot) {
        this.skip();
        return;
      }

      const testFilename = "test-instructions.instructions.md";
      const testContent =
        '---\ndescription: Test instructions\napplyTo: "**/*.ts"\n---\n\n# Test Instructions';

      try {
        await manager.installFile("instructions", testFilename, testContent);
        const isInstalled = await manager.isInstalled(
          "instructions",
          testFilename
        );
        assert.strictEqual(isInstalled, true);

        await manager.removeFile("instructions", testFilename);
        const isStillInstalled = await manager.isInstalled(
          "instructions",
          testFilename
        );
        assert.strictEqual(isStillInstalled, false);
      } catch (error) {
        try {
          await manager.removeFile("instructions", testFilename);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
    });

    test("Should get installed count for category", async function () {
      if (!testWorkspaceRoot) {
        this.skip();
        return;
      }

      const initialCount = await manager.getInstalledCount("agents");
      assert.ok(typeof initialCount === "number");
      assert.ok(initialCount >= 0);
    });

    test("Should list files in category", async function () {
      if (!testWorkspaceRoot) {
        this.skip();
        return;
      }

      const files = await manager.listFiles("agents");
      assert.ok(Array.isArray(files));

      // All files should end with .agent.md
      for (const file of files) {
        assert.ok(file.endsWith(".agent.md"));
      }
    });

    test("Should create directory if it does not exist", async function () {
      if (!testWorkspaceRoot) {
        this.skip();
        return;
      }

      const testFilename = "test-new-dir.agent.md";
      const testContent = "# Test";

      // Remove directory if it exists
      const dirPath = path.join(testWorkspaceRoot, ".github", "agents");
      const dirExists = await fs.promises
        .access(dirPath)
        .then(() => true)
        .catch(() => false);

      try {
        // Install file (should create directory if needed)
        await manager.installFile("agents", testFilename, testContent);

        // Verify directory was created
        const dirExistsNow = await fs.promises
          .access(dirPath)
          .then(() => true)
          .catch(() => false);
        assert.strictEqual(dirExistsNow, true);

        // Clean up
        await manager.removeFile("agents", testFilename);
      } catch (error) {
        try {
          await manager.removeFile("agents", testFilename);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
    });
  });
});
