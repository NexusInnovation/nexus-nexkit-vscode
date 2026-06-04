/**
 * Tests for GitExcludeConfigDeployer
 * Verifies that NexKit file exclusions are written to .git/info/exclude
 * (invisible to the repository) instead of .gitignore.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { GitExcludeConfigDeployer } from "../../src/features/initialization/gitExcludeConfigDeployer";

suite("Unit: GitExcludeConfigDeployer", () => {
  let deployer: GitExcludeConfigDeployer;
  let tempDir: string;

  setup(() => {
    deployer = new GitExcludeConfigDeployer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-git-exclude-test-"));
    // Create a fake .git directory (regular repo)
    fs.mkdirSync(path.join(tempDir, ".git", "info"), { recursive: true });
  });

  teardown(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }
  });

  test("Should create .git/info/exclude with .nexkit/ entry", async () => {
    await deployer.deployGitExclude(tempDir);

    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    assert.ok(fs.existsSync(excludePath));
    const content = fs.readFileSync(excludePath, "utf8");
    assert.ok(content.includes(".nexkit/"));
  });

  test("Should append .nexkit/ to existing .git/info/exclude", async () => {
    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    fs.writeFileSync(excludePath, "# existing content\n.local/\n", "utf8");

    await deployer.deployGitExclude(tempDir);

    const content = fs.readFileSync(excludePath, "utf8");
    assert.ok(content.includes(".local/"));
    assert.ok(content.includes(".nexkit/"));
  });

  test("Should be idempotent — does not duplicate .nexkit/ entry", async () => {
    await deployer.deployGitExclude(tempDir);
    await deployer.deployGitExclude(tempDir);

    const excludePath = path.join(tempDir, ".git", "info", "exclude");
    const content = fs.readFileSync(excludePath, "utf8");
    const matches = content.match(/\.nexkit\//g);
    assert.strictEqual(matches?.length, 1);
  });

  test("Should not touch .gitignore when no legacy NexKit section exists", async () => {
    fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n", "utf8");

    await deployer.deployGitExclude(tempDir);

    const content = fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8");
    assert.strictEqual(content, "node_modules/\n");
  });

  test("Should remove legacy NexKit section from .gitignore", async () => {
    const gitignorePath = path.join(tempDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules/\n\n# BEGIN NexKit\n.nexkit/\n# END NexKit\n", "utf8");

    await deployer.deployGitExclude(tempDir);

    const content = fs.readFileSync(gitignorePath, "utf8");
    assert.ok(!content.includes("# BEGIN NexKit"));
    assert.ok(!content.includes("# END NexKit"));
    assert.ok(content.includes("node_modules/"));
  });

  test("Should gracefully handle missing .git directory", async () => {
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-no-git-test-"));
    try {
      // Should not throw
      await deployer.deployGitExclude(noGitDir);
    } finally {
      fs.rmSync(noGitDir, { recursive: true, force: true });
    }
  });

  test("Should handle worktree .git file pointing to a git dir", async () => {
    // Simulate a worktree: .git is a file, actual git dir has info/exclude
    const fakeGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-fake-gitdir-"));
    fs.mkdirSync(path.join(fakeGitDir, "info"), { recursive: true });

    // Remove the .git directory created in setup and replace with a file
    fs.rmSync(path.join(tempDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".git"), `gitdir: ${fakeGitDir}\n`, "utf8");

    try {
      await deployer.deployGitExclude(tempDir);

      const excludePath = path.join(fakeGitDir, "info", "exclude");
      assert.ok(fs.existsSync(excludePath));
      const content = fs.readFileSync(excludePath, "utf8");
      assert.ok(content.includes(".nexkit/"));
    } finally {
      fs.rmSync(fakeGitDir, { recursive: true, force: true });
    }
  });
});
