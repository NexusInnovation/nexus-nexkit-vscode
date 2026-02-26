/**
 * Tests for CommitMessageService
 * Generates AI-powered commit messages for staged git changes.
 */

import * as assert from "assert";
import { CommitMessageService } from "../../src/features/commit-management/commitMessageService";

suite("Unit: CommitMessageService", () => {
  let service: CommitMessageService;

  setup(() => {
    service = new CommitMessageService();
  });

  test("Should instantiate CommitMessageService", () => {
    assert.ok(service);
  });

  test("Should have generateCommitMessage method", () => {
    assert.strictEqual(typeof service.generateCommitMessage, "function");
  });

  test("Should build prompt containing the diff", () => {
    const diff = "diff --git a/foo.ts b/foo.ts\n+added line";
    const prompt = service.buildPrompt(diff);

    assert.ok(prompt.includes(diff), "Prompt should contain the diff");
    assert.ok(prompt.includes("Conventional Commits"), "Prompt should reference Conventional Commits");
    assert.ok(prompt.includes("feat"), "Prompt should list commit types");
  });

  test("Should truncate diff longer than MAX_DIFF_LENGTH characters in prompt", () => {
    const longDiff = "x".repeat(CommitMessageService.MAX_DIFF_LENGTH + 1000);
    const prompt = service.buildPrompt(longDiff);

    assert.ok(prompt.includes("diff truncated"), "Prompt should note truncation for large diffs");
    // The raw oversized diff should NOT appear verbatim
    assert.ok(!prompt.includes(longDiff), "Prompt should not contain the full oversized diff");
  });

  test("Should not truncate diff of exactly MAX_DIFF_LENGTH characters in prompt", () => {
    const exactDiff = "y".repeat(CommitMessageService.MAX_DIFF_LENGTH);
    const prompt = service.buildPrompt(exactDiff);

    assert.ok(!prompt.includes("diff truncated"), "Prompt should not truncate a diff at exactly the limit");
    assert.ok(prompt.includes(exactDiff), "Prompt should contain the full diff when at the limit");
  });

  test("Should build prompt with imperative mood instruction", () => {
    const prompt = service.buildPrompt("some diff");
    assert.ok(prompt.includes("imperative mood"), "Prompt should instruct imperative mood");
  });

  test("Should expose MAX_DIFF_LENGTH as a positive number", () => {
    assert.ok(CommitMessageService.MAX_DIFF_LENGTH > 0, "MAX_DIFF_LENGTH should be a positive number");
    assert.strictEqual(typeof CommitMessageService.MAX_DIFF_LENGTH, "number");
  });
});
