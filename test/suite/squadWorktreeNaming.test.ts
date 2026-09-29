import * as assert from "assert";
import * as path from "path";
import { SquadWorktreeNaming } from "../../src/features/squad/services/squadWorktreeNaming";

suite("Unit: SquadWorktreeNaming (SQD-054)", () => {
  test("slugifies accents, punctuation and emoji with a stable fallback", () => {
    assert.strictEqual(
      SquadWorktreeNaming.slugify("SQD-053: Concevoir flux worktree par issue 🚀 Échéance"),
      "sqd-053-concevoir-flux-worktree-par-issue-echeance"
    );
    assert.strictEqual(SquadWorktreeNaming.slugify("🚀✨"), "issue");
  });

  test("bounds slugs to 50 characters on a word boundary", () => {
    const slug = SquadWorktreeNaming.slugify("one two three four five six seven eight nine ten eleven twelve");
    assert.ok(slug.length <= 50);
    assert.ok(!slug.endsWith("-"));
  });

  test("builds branch names and issue worktree paths from the main root", () => {
    const mainRoot = path.join(path.sep, "repo-parent", "nexus-nexkit-vscode");
    const names = SquadWorktreeNaming.buildNames({
      mainRoot,
      issueNumber: 269,
      title: "SQD-054: Implémenter worktree par issue",
    });

    assert.strictEqual(names.branch, "squad/269-sqd-054-implementer-worktree-par-issue");
    assert.strictEqual(names.worktreePath, path.join(path.dirname(mainRoot), "nexus-nexkit-vscode-269"));
    assert.strictEqual(SquadWorktreeNaming.parseIssueFromBranch(names.branch), 269);
  });

  test("derives the main root from the git common dir instead of a linked worktree path", () => {
    const commonDir = path.join(path.sep, "repo-parent", "nexus-nexkit-vscode", ".git");
    assert.strictEqual(SquadWorktreeNaming.mainRootFromCommonDir(commonDir), path.resolve(path.dirname(commonDir)));
  });
});
