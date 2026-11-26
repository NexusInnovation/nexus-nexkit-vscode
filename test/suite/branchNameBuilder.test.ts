/**
 * Tests for branch name builder
 */

import * as assert from "assert";
import { buildBranchName } from "../../src/features/devops-branch-creation/branchNameBuilder";
import { AzureDevOpsWorkItem } from "../../src/features/devops-branch-creation/models/azureDevOpsWorkItem";

function workItem(overrides: Partial<AzureDevOpsWorkItem>): AzureDevOpsWorkItem {
  return { id: 1234, type: "Bug", title: "Fix the thing", organization: "myorg", ...overrides };
}

suite("Unit: branchNameBuilder", () => {
  test("Should build a branch name from type, id and title", () => {
    const result = buildBranchName(workItem({ id: 42, type: "Bug", title: "Fix the login button" }));

    assert.strictEqual(result, "bugfix/42-fix-the-login-button");
  });

  test("Should map 'Product Backlog Item' to the 'feature' prefix", () => {
    const result = buildBranchName(workItem({ type: "Product Backlog Item", title: "Add feature" }));

    assert.strictEqual(result, "feature/1234-add-feature");
  });

  test("Should strip accented characters", () => {
    const result = buildBranchName(workItem({ title: "Gérer les échéances élevées" }));

    assert.strictEqual(result, "bugfix/1234-gerer-les-echeances-elevees");
  });

  test("Should replace non-alphanumeric characters with hyphens and collapse them", () => {
    const result = buildBranchName(workItem({ title: "Fix bug!!  in ***module*** (urgent)" }));

    assert.strictEqual(result, "bugfix/1234-fix-bug-in-module-urgent");
  });

  test("Should trim leading and trailing hyphens", () => {
    const result = buildBranchName(workItem({ title: "--- Fix this ---" }));

    assert.strictEqual(result, "bugfix/1234-fix-this");
  });

  test("Should truncate the title slug to 60 characters", () => {
    const longTitle = "a".repeat(100);
    const result = buildBranchName(workItem({ title: longTitle }));

    assert.strictEqual(result, `bugfix/1234-${"a".repeat(60)}`);
  });

  test("Should omit the title segment when the title slugifies to an empty string", () => {
    const result = buildBranchName(workItem({ title: "!!!???***" }));

    assert.strictEqual(result, "bugfix/1234");
  });

  test("Should fall back to 'item' when the type slugifies to an empty string", () => {
    const result = buildBranchName(workItem({ type: "###", title: "Fix this" }));

    assert.strictEqual(result, "item/1234-fix-this");
  });

  const mappedTypes: Array<[string, string]> = [
    ["Bug", "bugfix"],
    ["Issue", "bugfix"],
    ["User Story", "feature"],
    ["Product Backlog Item", "feature"],
    ["Requirement", "feature"],
    ["Feature", "feature"],
    ["Epic", "feature"],
    ["Improvement", "feature"],
    ["POC", "experiment"],
    ["Spike", "experiment"],
    ["Technical Debt", "chore"],
    ["Task", "chore"],
    ["Impediment", "chore"],
    ["Risk", "chore"],
    ["Review", "chore"],
    ["Change Request", "chore"],
    ["Test Case", "test"],
    ["Documentation", "docs"],
  ];

  for (const [type, prefix] of mappedTypes) {
    test(`Should map work item type "${type}" to prefix "${prefix}"`, () => {
      const result = buildBranchName(workItem({ type, title: "Some title" }));

      assert.strictEqual(result, `${prefix}/1234-some-title`);
    });
  }

  test("Should be case-insensitive when resolving the mapped prefix", () => {
    assert.strictEqual(buildBranchName(workItem({ type: "bug", title: "x" })), "bugfix/1234-x");
    assert.strictEqual(buildBranchName(workItem({ type: "BUG", title: "x" })), "bugfix/1234-x");
    assert.strictEqual(buildBranchName(workItem({ type: "  Bug  ", title: "x" })), "bugfix/1234-x");
  });

  test("Should fall back to slugify for an unmapped custom work item type", () => {
    const result = buildBranchName(workItem({ type: "Design Task", title: "Polish the header" }));

    assert.strictEqual(result, "design-task/1234-polish-the-header");
  });
});
