import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { SquadWorktreeRemovalFallback, squadErr, squadOk } from "../../src/features/squad/models";
import { WorktreeRemover } from "../../src/features/squad/services/worktreeRemover";

suite("Unit: WorktreeRemover (SQD-054)", () => {
  test("unlinks node_modules before invoking recursive removal fallbacks", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-remove-"));
    const worktreePath = path.join(root, "worktree");
    const realModules = path.join(root, "modules");
    await fs.promises.mkdir(worktreePath);
    await fs.promises.mkdir(realModules);
    await fs.promises.symlink(realModules, path.join(worktreePath, "node_modules"), process.platform === "win32" ? "junction" : "dir");

    const git = {
      removeWorktree: sinon.stub().callsFake(async () => {
        assert.strictEqual(await exists(path.join(worktreePath, "node_modules")), false);
        return squadErr({ code: "worktree-path-too-long", message: "too long" });
      }),
      prune: sinon.stub().resolves(squadOk(undefined)),
    };
    const remover = new WorktreeRemover({ git: git as never, platform: "linux" });

    const result = await remover.remove(root, worktreePath, { force: true });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.fallback, SquadWorktreeRemovalFallback.FsRm);
    }
    assert.strictEqual(git.removeWorktree.callCount, 2);
    assert.ok(git.prune.calledOnce);
    await fs.promises.rm(root, { recursive: true, force: true });
  });
});

async function exists(fsPath: string): Promise<boolean> {
  try {
    await fs.promises.access(fsPath);
    return true;
  } catch {
    return false;
  }
}

