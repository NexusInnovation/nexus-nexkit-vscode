/**
 * Tests for CommitMessageService
 * Generates AI-powered commit messages for staged git changes.
 */

import * as assert from "assert";
import { CommitMessageService, DEFAULT_SYSTEM_PROMPT } from "../../src/features/commit-management/commitMessageService";

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
    const prompt = service.buildPrompt(diff, DEFAULT_SYSTEM_PROMPT);

    assert.ok(prompt.includes(diff), "Prompt should contain the diff");
    assert.ok(prompt.includes("Conventional Commits"), "Prompt should reference Conventional Commits");
    assert.ok(prompt.includes("feat"), "Prompt should list commit types");
  });

  test("Should truncate diff longer than MAX_DIFF_LENGTH characters in prompt", () => {
    const longDiff = "x".repeat(CommitMessageService.MAX_DIFF_LENGTH + 1000);
    const prompt = service.buildPrompt(longDiff, DEFAULT_SYSTEM_PROMPT);

    assert.ok(prompt.includes("diff truncated"), "Prompt should note truncation for large diffs");
    // The raw oversized diff should NOT appear verbatim
    assert.ok(!prompt.includes(longDiff), "Prompt should not contain the full oversized diff");
  });

  test("Should not truncate diff of exactly MAX_DIFF_LENGTH characters in prompt", () => {
    const exactDiff = "y".repeat(CommitMessageService.MAX_DIFF_LENGTH);
    const prompt = service.buildPrompt(exactDiff, DEFAULT_SYSTEM_PROMPT);

    assert.ok(!prompt.includes("diff truncated"), "Prompt should not truncate a diff at exactly the limit");
    assert.ok(prompt.includes(exactDiff), "Prompt should contain the full diff when at the limit");
  });

  test("Should build prompt with imperative mood instruction", () => {
    const prompt = service.buildPrompt("some diff", DEFAULT_SYSTEM_PROMPT);
    assert.ok(prompt.includes("imperative mood"), "Prompt should instruct imperative mood");
  });

  test("Should expose MAX_DIFF_LENGTH as a positive number", () => {
    assert.ok(CommitMessageService.MAX_DIFF_LENGTH > 0, "MAX_DIFF_LENGTH should be a positive number");
    assert.strictEqual(typeof CommitMessageService.MAX_DIFF_LENGTH, "number");
  });

  // ─── Custom prompt template tests ────────────────────────────────────────

  test("Should use a custom prompt template with {{diff}} placeholder", () => {
    const customPrompt = "Generate a message for:\n{{diff}}\nDone.";
    const diff = "diff --git a/bar.ts b/bar.ts\n-old\n+new";
    const prompt = service.buildPrompt(diff, customPrompt);

    assert.ok(prompt.includes(diff), "Custom prompt should contain the diff");
    assert.ok(!prompt.includes("{{diff}}"), "Placeholder should be replaced");
    assert.ok(prompt.includes("Generate a message for:"), "Custom template text should be preserved");
    assert.ok(prompt.includes("Done."), "Custom template text after placeholder should be preserved");
  });

  test("Should append diff if custom prompt is missing {{diff}} placeholder", () => {
    const customPrompt = "Write a commit message. Use conventional commits.";
    const diff = "diff --git a/baz.ts b/baz.ts\n+new line";
    const prompt = service.buildPrompt(diff, customPrompt);

    assert.ok(prompt.includes(diff), "Diff should be appended when placeholder is missing");
    assert.ok(prompt.startsWith(customPrompt), "Prompt should start with the custom template");
    assert.ok(prompt.includes("Git diff:"), "Fallback should label the diff section");
  });

  test("Should export DEFAULT_SYSTEM_PROMPT containing {{diff}} placeholder", () => {
    assert.ok(DEFAULT_SYSTEM_PROMPT.includes("{{diff}}"), "Default prompt should contain the {{diff}} placeholder");
    assert.ok(DEFAULT_SYSTEM_PROMPT.includes("Conventional Commits"), "Default prompt should reference Conventional Commits");
  });
});
