import * as assert from 'assert';
import { MCPConfigManager } from '../../mcpConfigManager';

suite('Unit: MCPConfigManager', () => {
	test('should instantiate MCPConfigManager', () => {
		const manager = new MCPConfigManager();
		assert.ok(manager);
	});

	test('should preserve existing servers when adding new server', async () => {
		const manager = new MCPConfigManager();
		const configPath = manager["getUserMCPConfigPath"]();
		// Start with two servers
		await manager["updateMCPConfig"](configPath, {
			serversToAdd: {
				serverA: { command: "cmdA" },
				serverB: { command: "cmdB" }
			}
		});
		// Add a third server
		await manager["updateMCPConfig"](configPath, {
			serversToAdd: {
				serverC: { command: "cmdC" }
			}
		});
		const config = await manager.readUserMCPConfig();
		assert.ok(config.servers.serverA);
		assert.ok(config.servers.serverB);
		assert.ok(config.servers.serverC);
	});

	test('should preserve inputs when adding new server', async () => {
		const manager = new MCPConfigManager();
		const configPath = manager["getUserMCPConfigPath"]();
		await manager["updateMCPConfig"](configPath, {
			inputsToAdd: [{ id: "input1", type: "promptString" }]
		});
		await manager["updateMCPConfig"](configPath, {
			serversToAdd: { serverD: { command: "cmdD" } }
		});
		const config = JSON.parse(await require('fs').promises.readFile(configPath, 'utf8'));
		assert.ok(config.inputs.some((i: any) => i.id === "input1"));
		assert.ok(config.servers.serverD);
	});

	test('should not duplicate inputs with same id', async () => {
		const manager = new MCPConfigManager();
		const configPath = manager["getUserMCPConfigPath"]();
		await manager["updateMCPConfig"](configPath, {
			inputsToAdd: [{ id: "input2", type: "promptString" }]
		});
		await manager["updateMCPConfig"](configPath, {
			inputsToAdd: [{ id: "input2", type: "promptString", description: "desc" }]
		});
		const config = JSON.parse(await require('fs').promises.readFile(configPath, 'utf8'));
		const matches = config.inputs.filter((i: any) => i.id === "input2");
		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].description, "desc");
	});

	test('should preserve other config properties', async () => {
		const manager = new MCPConfigManager();
		const configPath = manager["getUserMCPConfigPath"]();
		await manager["updateMCPConfig"](configPath, {
			otherUpdates: { custom: "value" }
		});
		await manager["updateMCPConfig"](configPath, {
			serversToAdd: { serverE: { command: "cmdE" } }
		});
		const config = JSON.parse(await require('fs').promises.readFile(configPath, 'utf8'));
		assert.strictEqual(config.custom, "value");
		assert.ok(config.servers.serverE);
	});

	test('should handle multiple add operations', async () => {
		const manager = new MCPConfigManager();
		const configPath = manager["getUserMCPConfigPath"]();
		await manager["updateMCPConfig"](configPath, {
			serversToAdd: { serverF: { command: "cmdF" } }
		});
		await manager["updateMCPConfig"](configPath, {
			serversToAdd: { serverG: { command: "cmdG" } }
		});
		const config = JSON.parse(await require('fs').promises.readFile(configPath, 'utf8'));
		assert.ok(config.servers.serverF);
		assert.ok(config.servers.serverG);
	});

	test('should handle remove operation without affecting others', async () => {
		const manager = new MCPConfigManager();
		const configPath = manager["getUserMCPConfigPath"]();
		await manager["updateMCPConfig"](configPath, {
			serversToAdd: {
				serverH: { command: "cmdH" },
				serverI: { command: "cmdI" }
			}
		});
		await manager["updateMCPConfig"](configPath, {
			serversToRemove: ["serverH"]
		});
		const config = JSON.parse(await require('fs').promises.readFile(configPath, 'utf8'));
		assert.ok(!config.servers.serverH);
		assert.ok(config.servers.serverI);
	});

	test('should handle invalid JSON gracefully', async () => {
		const manager = new MCPConfigManager();
		const configPath = manager["getUserMCPConfigPath"]();
		const fs = require('fs');
		await fs.promises.writeFile(configPath, '{invalid json}', 'utf8');
		await manager["updateMCPConfig"](configPath, {
			serversToAdd: { serverJ: { command: "cmdJ" } }
		});
		const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
		assert.ok(config.servers.serverJ);
	});
});
