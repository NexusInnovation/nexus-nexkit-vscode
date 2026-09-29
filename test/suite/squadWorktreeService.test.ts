import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SquadBacklogProviderId, SquadWorktreeDependencyMode, squadOk } from "../../src/features/squad/models";
import { SquadWorktreeNaming } from "../../src/features/squad/services/squadWorktreeNaming";
import { SquadWorktreeService } from "../../src/features/squad/services/squadWorktreeService";

function memento(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, defaultValue?: T) => (values.has(key) ? (values.get(key) as T) : defaultValue as T),
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
}

suite("Unit: SquadWorktreeService cleanup safety (SQD-054)", () => {
  test("refuses to clean a dirty worktree unless discard is confirmed", async () => {
    const { service, worktreeId } = createService();

    const result = await service.cleanup({ worktreeId, deleteBranch: true, discardChanges: false });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, "worktree-dirty");
    }
  });

  test("stashes dirty changes before removing a confirmed cleanup target", async () => {
    const stashes: string[] = [];
    const removals: string[] = [];
    const { service, worktreeId } = createService({ stashes, removals });

    const result = await service.cleanup({ worktreeId, deleteBranch: true, discardChanges: true });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(stashes, [path.join(path.sep, "repo-269")]);
    assert.deepStrictEqual(removals, [path.join(path.sep, "repo-269")]);
  });
});

function createService(calls: { stashes?: string[]; removals?: string[] } = {}): { service: SquadWorktreeService; worktreeId: string } {
  const mainRoot = path.join(path.sep, "repo");
  const worktreePath = path.join(path.sep, "repo-269");
  const git = {
    commonDir: sinon.stub().resolves(squadOk(path.join(mainRoot, ".git"))),
    listWorktrees: sinon.stub().resolves(
      squadOk([
        { path: mainRoot, head: "a", branch: "main", bare: false, detached: false, locked: false, prunable: false, isMain: true },
        { path: worktreePath, head: "b", branch: "squad/269-title", bare: false, detached: false, locked: false, prunable: false, isMain: false },
      ])
    ),
    status: sinon.stub().callsFake(async (fsPath: string) => squadOk(fsPath === worktreePath)),
    getConfig: sinon.stub().resolves(squadOk("develop")),
    aheadBehind: sinon.stub().resolves(squadOk({ ahead: 0, behind: 0 })),
    stashAll: sinon.stub().callsFake(async (fsPath: string) => {
      calls.stashes?.push(fsPath);
      return squadOk(undefined);
    }),
    deleteBranch: sinon.stub().resolves(squadOk(undefined)),
    prune: sinon.stub().resolves(squadOk(undefined)),
  };
  const remover = {
    remove: sinon.stub().callsFake(async (_root: string, fsPath: string) => {
      calls.removals?.push(fsPath);
      return squadOk({ removed: true, fallback: "none" });
    }),
  };
  return {
    service: new SquadWorktreeService({
    git: git as never,
    backlog: { getWorkState: sinon.stub().resolves(squadOk({ item: "unknown", pullRequest: "unknown" })) } as never,
    dependencies: { setup: sinon.stub() } as never,
    remover: remover as never,
    workspaceState: memento(),
    getWorkspaceRoot: () => vscode.Uri.file(mainRoot),
    openFolder: async () => undefined,
    settings: {
      dependencies: () => SquadWorktreeDependencyMode.None,
      openInNewWindow: () => true,
      parentDirectory: () => "",
      copyUntracked: () => [],
    },
    }),
    worktreeId: SquadWorktreeNaming.opaqueId(worktreePath),
  };
}
