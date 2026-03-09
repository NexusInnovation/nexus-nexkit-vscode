/**
 * Tests for GitHubAuthPromptService
 * Verifies GitHub authentication verification at extension startup
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { GitHubAuthPromptService } from "../../src/features/initialization/githubAuthPromptService";
import { GitHubAuthHelper } from "../../src/shared/utils/githubAuthHelper";
import * as vscode from "vscode";

suite("Unit: GitHubAuthPromptService", () => {
  let service: GitHubAuthPromptService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    service = new GitHubAuthPromptService();
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Should instantiate GitHubAuthPromptService", () => {
    assert.ok(service);
  });

  test("Should return true when running in CI environment", async () => {
    sandbox.stub(GitHubAuthHelper, "isCI").returns(true);

    const result = await service.ensureAuthenticated();
    assert.strictEqual(result, true);
  });

  test("Should return true when a silent session already exists", async () => {
    sandbox.stub(GitHubAuthHelper, "isCI").returns(false);
    sandbox.stub(GitHubAuthHelper, "getGitHubSession").resolves({
      id: "test-session",
      accessToken: "test-token",
      account: { label: "user@example.com", id: "123" },
      scopes: ["repo"],
    });

    const result = await service.ensureAuthenticated();
    assert.strictEqual(result, true);
  });

  test("Should return true when environment token is available", async () => {
    sandbox.stub(GitHubAuthHelper, "isCI").returns(false);
    sandbox.stub(GitHubAuthHelper, "getGitHubSession").resolves(undefined);
    sandbox.stub(GitHubAuthHelper, "getGitHubTokenFromEnv").returns("gho_test_token");

    const result = await service.ensureAuthenticated();
    assert.strictEqual(result, true);
  });

  test("Should prompt user and return true when user signs in", async () => {
    sandbox.stub(GitHubAuthHelper, "isCI").returns(false);
    const getSessionStub = sandbox.stub(GitHubAuthHelper, "getGitHubSession");
    // First call (silent) returns undefined
    getSessionStub.onFirstCall().resolves(undefined);
    // Second call (with prompt) returns a session
    getSessionStub.onSecondCall().resolves({
      id: "new-session",
      accessToken: "new-token",
      account: { label: "user@example.com", id: "123" },
      scopes: ["repo"],
    });
    sandbox.stub(GitHubAuthHelper, "getGitHubTokenFromEnv").returns(undefined);
    sandbox.stub(vscode.window, "showWarningMessage").resolves("Sign in with GitHub" as any);

    const result = await service.ensureAuthenticated();
    assert.strictEqual(result, true);
  });

  test("Should return false when user defers authentication", async () => {
    sandbox.stub(GitHubAuthHelper, "isCI").returns(false);
    sandbox.stub(GitHubAuthHelper, "getGitHubSession").resolves(undefined);
    sandbox.stub(GitHubAuthHelper, "getGitHubTokenFromEnv").returns(undefined);
    sandbox.stub(vscode.window, "showWarningMessage").resolves("Later" as any);

    const result = await service.ensureAuthenticated();
    assert.strictEqual(result, false);
  });
});
