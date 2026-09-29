import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import { GitWorktreeClient, mapGitFailure, parseBranchRefs, parseWorktreePorcelain } from "../../src/features/squad/services/gitWorktreeClient";
import { SquadSpawnResult } from "../../src/features/squad/services/squadProcessRunner";

function ok(stdout = ""): SquadSpawnResult {
  return { stdout, stderr: "", exitCode: 0, timedOut: false, cancelled: false };
}

suite("Unit: GitWorktreeClient (SQD-054)", () => {
  test("parses porcelain -z worktree output", () => {
    const mainPath = path.join(path.sep, "repo");
    const linkedPath = path.join(path.sep, "repo-269");
    const output = [
      `worktree ${mainPath}`,
      "HEAD abc",
      "branch refs/heads/main",
      `worktree ${linkedPath}`,
      "HEAD def",
      "branch refs/heads/squad/269-title",
      "locked",
      "prunable",
      "",
    ].join("\0");

    const entries = parseWorktreePorcelain(output);

    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].isMain, true);
    assert.strictEqual(entries[1].branch, "squad/269-title");
    assert.strictEqual(entries[1].locked, true);
    assert.strictEqual(entries[1].prunable, true);
  });

  test("matches existing work by branch prefix across local and remote refs", () => {
    const refs = parseBranchRefs(
      [
        "main\0",
        "squad/269-old-title\0",
        "origin/squad/269-old-title\0",
        "origin/squad/270-other\0",
      ].join("\n"),
      "squad/269-"
    );

    assert.deepStrictEqual(refs.map((ref) => ref.name), ["squad/269-old-title", "origin/squad/269-old-title"]);
  });

  test("uses --no-track for new worktree branches", async () => {
    const run = sinon.stub().resolves(ok());
    const client = new GitWorktreeClient({ runner: { run }, gitCommand: "git" });
    const root = path.join(path.sep, "repo");
    const target = path.join(path.sep, "repo-269");

    const result = await client.addWorktree(root, {
      path: target,
      branch: "squad/269-title",
      startPoint: "origin/develop",
      newBranch: true,
      track: false,
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(run.firstCall.args[0].args, [
      "-C",
      root,
      "worktree",
      "add",
      "--no-track",
      "-b",
      "squad/269-title",
      target,
      "origin/develop",
    ]);
  });

  test("maps long path and lock stderr to actionable errors", () => {
    assert.strictEqual(
      mapGitFailure({ ...ok(), exitCode: 1, stderr: "fatal: Filename too long" })?.code,
      "worktree-path-too-long"
    );
    assert.strictEqual(
      mapGitFailure({ ...ok(), exitCode: 1, stderr: "could not lock config file .git/config.lock: File exists" })?.code,
      "worktree-locked"
    );
  });
});

