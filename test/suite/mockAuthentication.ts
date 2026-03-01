/**
 * Mock setup for GitHub authentication in tests
 * Prevents "DialogService: refused to show dialog in tests" errors
 * by stubbing VS Code's authentication API before tests run
 */

import * as sinon from "sinon";
import * as vscode from "vscode";

/**
 * Mock authentication session
 */
const createMockSession = (): vscode.AuthenticationSession => ({
  id: "test-session-id",
  accessToken: "gho_test_token_1234567890",
  account: {
    label: "test@example.com",
    id: "12345",
  },
  scopes: ["repo", "gist", "user"],
});

/**
 * Setup mock for GitHub authentication
 * This prevents VS Code from trying to show authentication dialogs during tests
 */
export function setupGitHubAuthenticationMock(): sinon.SinonStub {
  const mockSession = createMockSession();

  // Stub vscode.authentication.getSession to return a mock session
  const getSessionStub = sinon.stub(vscode.authentication, "getSession").resolves(mockSession);

  return getSessionStub;
}

/**
 * Teardown mock for GitHub authentication
 */
export function teardownGitHubAuthenticationMock(stub: sinon.SinonStub): void {
  if (stub) {
    stub.restore();
  }
}

/**
 * Setup for all tests - called once before tests run
 */
export function setupBeforeAllTests(): void {
  // Setup GitHub authentication mock
  try {
    setupGitHubAuthenticationMock();
  } catch (error) {
    // If sinon is not available or test environment doesn't support stubbing,
    // tests will continue without the mock (they may show warnings but won't fail)
    console.log("ℹ️  GitHub authentication mock not available, tests will continue without it");
  }
}
