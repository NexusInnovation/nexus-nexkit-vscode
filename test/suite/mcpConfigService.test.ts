/**
 * Tests for MCPConfigService
 * Manages MCP (Model Context Protocol) server configurations
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sinon from "sinon";
import { MCPConfigService } from "../../src/features/mcp-management/mcpConfigService";
import { ConfirmationService } from "../../src/shared/services/confirmationService";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: MCPConfigService", () => {
  let service: MCPConfigService;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;
  let mockConfirmation: sinon.SinonStubbedInstance<ConfirmationService>;

  setup(async () => {
    sandbox = sinon.createSandbox();
    mockConfirmation = sandbox.createStubInstance(ConfirmationService);
    mockConfirmation.confirm.resolves("accepted");
    service = new MCPConfigService(mockConfirmation as any);
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-mcp-test-"));
  });

  teardown(async () => {
    sandbox.restore();
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate MCPConfigService", () => {
    assert.ok(service);
  });

  test("Should have required server names as static properties", () => {
    assert.strictEqual(MCPConfigService.Context7ServerName, "context7");
    assert.strictEqual(MCPConfigService.SequentialThinkingServerName, "sequential-thinking");
  });

  test("Should have check methods", () => {
    assert.strictEqual(typeof service.checkRequiredUserMCPs, "function");
  });

  test("Should have add server methods", () => {
    assert.strictEqual(typeof service.addUserMCPServer, "function");
    assert.strictEqual(typeof service.addWorkspaceMCPServer, "function");
  });

  test("Should check required MCPs", async function () {
    this.timeout(5000);

    const result = await service.checkRequiredUserMCPs();
    assert.ok(result);
    assert.ok(Array.isArray(result.configured));
    assert.ok(Array.isArray(result.missing));
  });

  // --- Confirmation gate tests ---

  test("addUserMCPServer should call confirmation with the user-level key", async () => {
    sandbox.stub(fs.promises, "writeFile").resolves();
    sandbox.stub(fs.promises, "mkdir").resolves();
    sandbox.stub(fs.promises, "readFile").rejects(new Error("ENOENT"));

    const serverName = "my-test-server";
    await service.addUserMCPServer(serverName, { command: "npx", args: ["-y", "my-test-server"] });

    assert.ok(mockConfirmation.confirm.calledOnce, "Confirmation should be shown");
    const [, , key] = mockConfirmation.confirm.firstCall.args;
    assert.strictEqual(key, SettingsManager.CONFIRMATION_KEYS.mcpUserServer(serverName));
  });

  test("addUserMCPServer should skip write when confirmation returns refused", async () => {
    mockConfirmation.confirm.resolves("refused");
    const writeStub = sandbox.stub(fs.promises, "writeFile").resolves();

    await service.addUserMCPServer("my-server", { command: "npx", args: [] });

    assert.ok(writeStub.notCalled, "Config file should NOT be written when refused");
  });

  test("addUserMCPServer should skip write when confirmation returns refused-forever", async () => {
    mockConfirmation.confirm.resolves("refused-forever");
    const writeStub = sandbox.stub(fs.promises, "writeFile").resolves();

    await service.addUserMCPServer("my-server", { command: "npx", args: [] });

    assert.ok(writeStub.notCalled, "Config file should NOT be written when refused forever");
  });

  test("addWorkspaceMCPServer should call confirmation with the workspace-level key", async () => {
    sandbox.stub(fs.promises, "writeFile").resolves();
    sandbox.stub(fs.promises, "mkdir").resolves();
    sandbox.stub(fs.promises, "readFile").rejects(new Error("ENOENT"));

    const serverName = "workspace-server";
    await service.addWorkspaceMCPServer(serverName, { command: "npx", args: ["-y", "ws-server"] });

    assert.ok(mockConfirmation.confirm.calledOnce, "Confirmation should be shown");
    const [, , key] = mockConfirmation.confirm.firstCall.args;
    assert.strictEqual(key, SettingsManager.CONFIRMATION_KEYS.mcpWorkspaceServer(serverName));
  });

  test("addWorkspaceMCPServer should skip write when confirmation returns refused", async () => {
    mockConfirmation.confirm.resolves("refused");
    const writeStub = sandbox.stub(fs.promises, "writeFile").resolves();

    await service.addWorkspaceMCPServer("ws-server", { command: "npx", args: [] });

    assert.ok(writeStub.notCalled, "Config file should NOT be written when refused");
  });
});

suite("Integration: MCPConfigService - Config File Operations", () => {
  let service: MCPConfigService;
  let sandbox: sinon.SinonSandbox;
  let mockConfirmation: sinon.SinonStubbedInstance<ConfirmationService>;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockConfirmation = sandbox.createStubInstance(ConfirmationService);
    mockConfirmation.confirm.resolves("accepted");
    service = new MCPConfigService(mockConfirmation as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Should check for required user MCPs", async function () {
    this.timeout(5000);

    const result = await service.checkRequiredUserMCPs();
    assert.ok(result);
    assert.ok(Array.isArray(result.configured));
    assert.ok(Array.isArray(result.missing));
    // Verify we are checking for the right servers
    const allServers = [...result.configured, ...result.missing];
    assert.ok(allServers.includes("context7") || allServers.includes("sequential-thinking"));
  });
});
