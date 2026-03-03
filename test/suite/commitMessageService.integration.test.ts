/**
 * Integration tests for CommitMessageService
 * Tests the full generate-commit-message flow including auto-staging,
 * git extension interaction, and AI model integration.
 *
 * These tests mock the VS Code Git Extension API and Language Model API
 * to simulate the end-to-end workflow without requiring a real git repo
 * or Copilot access.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { CommitMessageService } from "../../src/features/commit-management/commitMessageService";
import { SettingsManager } from "../../src/core/settingsManager";

/** Helper: create a fake async iterable that yields the given chunks. */
function fakeAsyncIterable(chunks: string[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < chunks.length) {
            return { value: chunks[i++], done: false };
          }
          return { value: undefined as any, done: true };
        },
      };
    },
  };
}

suite("Integration: CommitMessageService – Generate Commit Message", () => {
  let service: CommitMessageService;
  let sandbox: sinon.SinonSandbox;

  // Mocks
  let getExtensionStub: sinon.SinonStub;
  let selectChatModelsStub: sinon.SinonStub;
  let isCommitMessageEnabledStub: sinon.SinonStub;
  let getCommitMessageModelStub: sinon.SinonStub;
  let getCommitMessageSystemPromptStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let withProgressStub: sinon.SinonStub;

  // Repository mock state
  let mockInputBox: { value: string };
  let mockDiffResults: string[];
  let mockAddSpy: sinon.SinonSpy;
  let mockWorkingTreeChanges: Array<{ uri: vscode.Uri }>;
  let mockIndexChanges: Array<{ uri: vscode.Uri }>;

  setup(() => {
    sandbox = sinon.createSandbox();
    service = new CommitMessageService();

    // ── Default mock state ──────────────────────────────────────────────
    mockInputBox = { value: "" };
    mockDiffResults = []; // diff() pops from this array in order
    mockAddSpy = sandbox.spy();
    mockWorkingTreeChanges = [];
    mockIndexChanges = [];

    // ── Git Extension mock ──────────────────────────────────────────────
    const mockRepository = {
      diff: sandbox.stub().callsFake(async (_cached: boolean) => {
        return mockDiffResults.shift() ?? "";
      }),
      add: sandbox.stub().callsFake(async (paths: string[]) => {
        mockAddSpy(paths);
      }),
      inputBox: mockInputBox,
      state: {
        get indexChanges() {
          return mockIndexChanges;
        },
        get workingTreeChanges() {
          return mockWorkingTreeChanges;
        },
      },
    };

    const mockGitExtension = {
      exports: {
        getAPI: (_version: number) => ({
          repositories: [mockRepository],
        }),
      },
    };

    getExtensionStub = sandbox.stub(vscode.extensions, "getExtension");
    getExtensionStub.withArgs("vscode.git").returns(mockGitExtension as any);
    getExtensionStub.callThrough(); // Let other extensions resolve normally

    // ── Settings stubs ──────────────────────────────────────────────────
    isCommitMessageEnabledStub = sandbox.stub(SettingsManager, "isCommitMessageEnabled").returns(true);
    getCommitMessageModelStub = sandbox.stub(SettingsManager, "getCommitMessageModel").returns("");
    getCommitMessageSystemPromptStub = sandbox.stub(SettingsManager, "getCommitMessageSystemPrompt").returns("");

    // ── VS Code window stubs ────────────────────────────────────────────
    showErrorMessageStub = sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
    showInformationMessageStub = sandbox.stub(vscode.window, "showInformationMessage").resolves(undefined);

    // Make withProgress run the callback immediately (skipping UI)
    withProgressStub = sandbox.stub(vscode.window, "withProgress").callsFake(async (_opts: any, task: any) => {
      const token: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: new vscode.EventEmitter<void>().event,
      };
      return task({ report: () => {} }, token);
    });

    // ── Language Model stub ─────────────────────────────────────────────
    selectChatModelsStub = sandbox.stub(vscode.lm, "selectChatModels");
  });

  teardown(() => {
    sandbox.restore();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1: Staged changes exist → generate commit message directly
  // ─────────────────────────────────────────────────────────────────────────
  test("Should generate commit message when changes are already staged", async () => {
    // Arrange: staged diff available on first call
    mockDiffResults.push("diff --git a/src/app.ts b/src/app.ts\n+console.log('hello');");
    mockIndexChanges.push({ uri: vscode.Uri.file("/repo/src/app.ts") });

    const expectedMessage = "feat(app): add hello log statement\n\n- Add console.log call in app.ts";
    selectChatModelsStub.resolves([
      {
        name: "test-model",
        family: "gpt-4o",
        sendRequest: sandbox.stub().resolves({
          text: fakeAsyncIterable(["feat(app): add hello log statement", "\n\n- Add console.log call in app.ts"]),
        }),
      },
    ]);

    // Act
    await service.generateCommitMessage();

    // Assert
    assert.strictEqual(mockInputBox.value, expectedMessage, "SCM input box should contain the generated commit message");
    assert.ok(mockAddSpy.notCalled, "repo.add() should NOT be called because changes were already staged");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2: No staged changes, unstaged changes exist → auto-stage then generate
  // ─────────────────────────────────────────────────────────────────────────
  test("Should auto-stage working tree changes and generate commit message", async () => {
    // Arrange: first diff() returns empty (nothing staged),
    //          after add() second diff() returns the staged diff
    mockDiffResults.push(""); // before staging
    mockDiffResults.push("diff --git a/README.md b/README.md\n+new documentation line");
    mockWorkingTreeChanges.push({ uri: vscode.Uri.file("/repo/README.md") }, { uri: vscode.Uri.file("/repo/src/index.ts") });

    const expectedMessage = "docs: update README documentation";
    selectChatModelsStub.resolves([
      {
        name: "test-model",
        family: "gpt-4o",
        sendRequest: sandbox.stub().resolves({
          text: fakeAsyncIterable(["docs: update README documentation"]),
        }),
      },
    ]);

    // Act
    await service.generateCommitMessage();

    // Assert — auto-staging happened
    assert.ok(mockAddSpy.calledOnce, "repo.add() should be called once to stage unstaged files");
    const stagedPaths: string[] = mockAddSpy.firstCall.args[0];
    assert.strictEqual(stagedPaths.length, 2, "Should stage both working tree files");
    assert.ok(
      stagedPaths.every((p) => typeof p === "string"),
      "repo.add() should receive string paths"
    );

    // Assert — commit message generated
    assert.strictEqual(mockInputBox.value, expectedMessage, "SCM input box should contain the generated commit message");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3: No staged changes, no unstaged changes → inform user
  // ─────────────────────────────────────────────────────────────────────────
  test("Should show information message when there are no changes at all", async () => {
    // Arrange: empty diff, empty working tree
    mockDiffResults.push("");

    // Act
    await service.generateCommitMessage();

    // Assert
    assert.ok(
      showInformationMessageStub.calledWith("Nexkit: No changes found in the working tree."),
      "Should inform the user there are no changes"
    );
    assert.strictEqual(mockInputBox.value, "", "Input box should remain empty");
    assert.ok(mockAddSpy.notCalled, "repo.add() should not be called");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4: Feature disabled via settings → no-op
  // ─────────────────────────────────────────────────────────────────────────
  test("Should not generate when commit message feature is disabled", async () => {
    isCommitMessageEnabledStub.returns(false);

    await service.generateCommitMessage();

    assert.strictEqual(mockInputBox.value, "", "Input box should remain empty when feature is disabled");
    assert.ok(selectChatModelsStub.notCalled, "Should not attempt to select an AI model");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5: No AI model available → show error
  // ─────────────────────────────────────────────────────────────────────────
  test("Should show error when no AI model is available", async () => {
    mockDiffResults.push("diff --git a/foo.ts b/foo.ts\n+line");
    mockIndexChanges.push({ uri: vscode.Uri.file("/repo/foo.ts") });

    // No models available for any selector
    selectChatModelsStub.resolves([]);

    await service.generateCommitMessage();

    assert.ok(showErrorMessageStub.calledOnce, "Should show an error message about missing AI model");
    const errorMsg: string = showErrorMessageStub.firstCall.args[0];
    assert.ok(errorMsg.includes("No AI model available"), "Error should mention no AI model available");
    assert.strictEqual(mockInputBox.value, "", "Input box should remain empty");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 6: Auto-staging fails → show error
  // ─────────────────────────────────────────────────────────────────────────
  test("Should show error when auto-staging fails", async () => {
    mockDiffResults.push(""); // no staged changes
    mockWorkingTreeChanges.push({ uri: vscode.Uri.file("/repo/broken.ts") });

    // Override the repository add() to throw
    getExtensionStub.withArgs("vscode.git").returns({
      exports: {
        getAPI: () => ({
          repositories: [
            {
              diff: sandbox.stub().resolves(""),
              add: sandbox.stub().rejects(new Error("Permission denied")),
              inputBox: mockInputBox,
              state: {
                indexChanges: [],
                workingTreeChanges: mockWorkingTreeChanges,
              },
            },
          ],
        }),
      },
    } as any);

    await service.generateCommitMessage();

    assert.ok(showErrorMessageStub.calledOnce, "Should show an error message when staging fails");
    const errorMsg: string = showErrorMessageStub.firstCall.args[0];
    assert.ok(errorMsg.includes("Failed to stage changes"), "Error should mention staging failure");
    assert.strictEqual(mockInputBox.value, "", "Input box should remain empty");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 7: Git extension not found → show error
  // ─────────────────────────────────────────────────────────────────────────
  test("Should show error when git extension is not available", async () => {
    getExtensionStub.withArgs("vscode.git").returns(undefined);

    await service.generateCommitMessage();

    assert.ok(showErrorMessageStub.calledOnce, "Should show an error message about missing git extension");
    const errorMsg: string = showErrorMessageStub.firstCall.args[0];
    assert.ok(errorMsg.includes("Git extension not found"), "Error should mention git extension");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 8: Diff still empty after auto-staging → inform user
  // ─────────────────────────────────────────────────────────────────────────
  test("Should inform user when diff is empty after auto-staging", async () => {
    mockDiffResults.push(""); // no staged changes
    mockDiffResults.push(""); // still empty after staging
    mockWorkingTreeChanges.push({ uri: vscode.Uri.file("/repo/empty.ts") });

    await service.generateCommitMessage();

    assert.ok(mockAddSpy.calledOnce, "repo.add() should have been called");
    assert.ok(
      showInformationMessageStub.calledWith("Nexkit: No diff detected after staging. Please check your working tree."),
      "Should inform user that diff is empty after staging"
    );
    assert.strictEqual(mockInputBox.value, "", "Input box should remain empty");
  });
});
