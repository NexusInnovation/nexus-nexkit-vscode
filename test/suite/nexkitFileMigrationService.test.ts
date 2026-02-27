/**
 * Tests for NexkitFileMigrationService
 * Handles migrating nexkit.* files from .github/<type>/ to .nexkit/<type>/
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NexkitFileMigrationService } from "../../src/features/initialization/nexkitFileMigrationService";

suite("Unit: NexkitFileMigrationService", () => {
  let service: NexkitFileMigrationService;
  let tempDir: string;

  setup(async () => {
    service = new NexkitFileMigrationService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-migration-test-"));
  });

  teardown(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should instantiate NexkitFileMigrationService", () => {
    assert.ok(service);
  });

  test("Should return null when .github directory does not exist", async () => {
    const result = await service.migrateNexkitFiles(tempDir);
    assert.strictEqual(result, null);
  });

  test("Should return null when .github exists but has no template subdirectories", async () => {
    fs.mkdirSync(path.join(tempDir, ".github"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".github", "README.md"), "readme");

    const result = await service.migrateNexkitFiles(tempDir);
    assert.strictEqual(result, null);
  });

  test("Should return null when template subdirectories exist but contain no nexkit.* files", async () => {
    const agentsDir = path.join(tempDir, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "custom.agent.md"), "agent content");

    const result = await service.migrateNexkitFiles(tempDir);
    assert.strictEqual(result, null);
  });

  test("Should migrate nexkit.* files from .github/agents to .nexkit/agents", async () => {
    const agentsDir = path.join(tempDir, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "nexkit.code-review.md"), "code review agent");
    fs.writeFileSync(path.join(agentsDir, "nexkit.test-writer.md"), "test writer agent");

    const result = await service.migrateNexkitFiles(tempDir);

    assert.ok(result);
    assert.strictEqual(result.migratedCount, 2);
    assert.deepStrictEqual(result.migratedFiles["agents"]?.sort(), ["nexkit.code-review.md", "nexkit.test-writer.md"].sort());

    // Verify files exist in .nexkit/agents
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "agents", "nexkit.code-review.md")));
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "agents", "nexkit.test-writer.md")));

    // Verify files removed from .github/agents
    assert.ok(!fs.existsSync(path.join(agentsDir, "nexkit.code-review.md")));
    assert.ok(!fs.existsSync(path.join(agentsDir, "nexkit.test-writer.md")));
  });

  test("Should migrate nexkit.* files from multiple template type directories", async () => {
    // Create agents
    const agentsDir = path.join(tempDir, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "nexkit.agent.md"), "agent content");

    // Create prompts
    const promptsDir = path.join(tempDir, ".github", "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "nexkit.prompt.md"), "prompt content");

    // Create instructions
    const instructionsDir = path.join(tempDir, ".github", "instructions");
    fs.mkdirSync(instructionsDir, { recursive: true });
    fs.writeFileSync(path.join(instructionsDir, "nexkit.instruction.md"), "instruction content");

    const result = await service.migrateNexkitFiles(tempDir);

    assert.ok(result);
    assert.strictEqual(result.migratedCount, 3);
    assert.deepStrictEqual(result.migratedFiles["agents"], ["nexkit.agent.md"]);
    assert.deepStrictEqual(result.migratedFiles["prompts"], ["nexkit.prompt.md"]);
    assert.deepStrictEqual(result.migratedFiles["instructions"], ["nexkit.instruction.md"]);

    // Verify all files migrated
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "agents", "nexkit.agent.md")));
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "prompts", "nexkit.prompt.md")));
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "instructions", "nexkit.instruction.md")));
  });

  test("Should only move files starting with nexkit. and leave other files untouched", async () => {
    const agentsDir = path.join(tempDir, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "nexkit.managed.md"), "managed content");
    fs.writeFileSync(path.join(agentsDir, "custom.agent.md"), "custom content");
    fs.writeFileSync(path.join(agentsDir, "my-agent.md"), "my agent content");

    const result = await service.migrateNexkitFiles(tempDir);

    assert.ok(result);
    assert.strictEqual(result.migratedCount, 1);
    assert.deepStrictEqual(result.migratedFiles["agents"], ["nexkit.managed.md"]);

    // Verify nexkit.* moved
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "agents", "nexkit.managed.md")));
    assert.ok(!fs.existsSync(path.join(agentsDir, "nexkit.managed.md")));

    // Verify other files untouched
    assert.ok(fs.existsSync(path.join(agentsDir, "custom.agent.md")));
    assert.ok(fs.existsSync(path.join(agentsDir, "my-agent.md")));
  });

  test("Should preserve file content during migration", async () => {
    const agentsDir = path.join(tempDir, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    const originalContent = "# My Agent\n\nThis is a detailed agent file with special chars: àéîõü 🖥️\n";
    fs.writeFileSync(path.join(agentsDir, "nexkit.agent.md"), originalContent);

    await service.migrateNexkitFiles(tempDir);

    const migratedContent = fs.readFileSync(path.join(tempDir, ".nexkit", "agents", "nexkit.agent.md"), "utf8");
    assert.strictEqual(migratedContent, originalContent);
  });

  test("Should not migrate directories starting with nexkit.", async () => {
    const agentsDir = path.join(tempDir, ".github", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    // Create a subdirectory starting with nexkit. (should be ignored)
    fs.mkdirSync(path.join(agentsDir, "nexkit.subdir"), { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "nexkit.subdir", "file.md"), "content");
    // Create a regular nexkit file (should be migrated)
    fs.writeFileSync(path.join(agentsDir, "nexkit.agent.md"), "agent content");

    const result = await service.migrateNexkitFiles(tempDir);

    assert.ok(result);
    assert.strictEqual(result.migratedCount, 1);
    assert.deepStrictEqual(result.migratedFiles["agents"], ["nexkit.agent.md"]);

    // Directory should remain in .github
    assert.ok(fs.existsSync(path.join(agentsDir, "nexkit.subdir", "file.md")));
  });

  test("Should create .nexkit subdirectories as needed", async () => {
    const promptsDir = path.join(tempDir, ".github", "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "nexkit.prompt.md"), "prompt content");

    // Verify .nexkit doesn't exist yet
    assert.ok(!fs.existsSync(path.join(tempDir, ".nexkit")));

    await service.migrateNexkitFiles(tempDir);

    // Verify .nexkit/prompts was created
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "prompts")));
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "prompts", "nexkit.prompt.md")));
  });

  test("Should handle skills directory migration", async () => {
    const skillsDir = path.join(tempDir, ".github", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "nexkit.skill.md"), "skill content");

    const result = await service.migrateNexkitFiles(tempDir);

    assert.ok(result);
    assert.strictEqual(result.migratedCount, 1);
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "skills", "nexkit.skill.md")));
  });

  test("Should handle chatmodes directory migration", async () => {
    const chatmodesDir = path.join(tempDir, ".github", "chatmodes");
    fs.mkdirSync(chatmodesDir, { recursive: true });
    fs.writeFileSync(path.join(chatmodesDir, "nexkit.chatmode.md"), "chatmode content");

    const result = await service.migrateNexkitFiles(tempDir);

    assert.ok(result);
    assert.strictEqual(result.migratedCount, 1);
    assert.ok(fs.existsSync(path.join(tempDir, ".nexkit", "chatmodes", "nexkit.chatmode.md")));
  });
});
