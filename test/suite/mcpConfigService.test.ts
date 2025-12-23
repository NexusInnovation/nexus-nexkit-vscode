/**
 * Tests for MCPConfigService
 * Manages MCP (Model Context Protocol) server configurations
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MCPConfigService } from "../../src/features/mcp-management/mcpConfigService";

suite("Unit: MCPConfigService", () => {
  let service: MCPConfigService;
  let tempDir: string;

  setup(async () => {
    service = new MCPConfigService();
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-mcp-test-"));
  });

  teardown(async () => {
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
});

suite("Integration: MCPConfigService - Config File Operations", () => {
  let service: MCPConfigService;

  setup(() => {
    service = new MCPConfigService();
  });

  test("Should check for required user MCPs", async function () {
    this.timeout(5000);

    const result = await service.checkRequiredUserMCPs();
    assert.ok(result);
    assert.ok(Array.isArray(result.configured));
    assert.ok(Array.isArray(result.missing));
    // Verify we're checking for the right servers
    const allServers = [...result.configured, ...result.missing];
    assert.ok(allServers.includes("context7") || allServers.includes("sequential-thinking"));
  });
});
