import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { SquadWorktreeDependencyMode, SquadWorktreeDependencyState } from "../../src/features/squad/models";
import { WorktreeDependencyStrategy } from "../../src/features/squad/services/worktreeDependencyStrategy";

suite("Unit: WorktreeDependencyStrategy (SQD-054)", () => {
  test("refuses pnpm node_modules linking and runs a real install instead", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-deps-"));
    const mainRoot = path.join(root, "main");
    const worktreePath = path.join(root, "worktree");
    await fs.promises.mkdir(mainRoot);
    await fs.promises.mkdir(worktreePath);
    await fs.promises.writeFile(path.join(worktreePath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    const run = sinon.stub().resolves({ stdout: "", stderr: "", exitCode: 0, timedOut: false, cancelled: false });
    const strategy = new WorktreeDependencyStrategy({ runner: { run }, workspaceTrusted: () => true });

    const result = await strategy.setup({
      mainRoot,
      worktreePath,
      requestedMode: SquadWorktreeDependencyMode.Link,
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.outcome.state, SquadWorktreeDependencyState.Installed);
      assert.strictEqual(result.value.warnings[0].code, "pnpm-link-refused");
    }
    assert.deepStrictEqual(run.firstCall.args[0].args, ["install", "--frozen-lockfile", "--prefer-offline"]);
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  test("returns explicit failed dependency state instead of throwing", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-deps-fail-"));
    await fs.promises.writeFile(path.join(root, "package-lock.json"), "{}", "utf8");
    const strategy = new WorktreeDependencyStrategy({
      runner: { run: sinon.stub().resolves({ stdout: "", stderr: "boom", exitCode: 1, timedOut: false, cancelled: false }) },
      workspaceTrusted: () => true,
    });

    const result = await strategy.setup({
      mainRoot: root,
      worktreePath: root,
      requestedMode: SquadWorktreeDependencyMode.Install,
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.outcome.state, SquadWorktreeDependencyState.Failed);
      assert.strictEqual(result.value.outcome.error?.code, "dependency-setup-failed");
    }
    await fs.promises.rm(root, { recursive: true, force: true });
  });
});

