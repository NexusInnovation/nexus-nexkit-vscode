/**
 * Tests for GitHubWorkflowRunnerService
 * Discovers and runs GitHub Actions workflows locally using act
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { GitHubWorkflowRunnerService } from "../../src/features/github-workflow-runner/githubWorkflowRunnerService";

suite("Unit: GitHubWorkflowRunnerService", () => {
  let service: GitHubWorkflowRunnerService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    service = new GitHubWorkflowRunnerService();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Should instantiate GitHubWorkflowRunnerService", () => {
    assert.ok(service);
  });

  test("Should have listWorkflows method", () => {
    assert.strictEqual(typeof service.listWorkflows, "function");
  });

  test("Should have runWorkflow method", () => {
    assert.strictEqual(typeof service.runWorkflow, "function");
  });

  test("Should return empty array when no workspace is open", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);
    const workflows = await service.listWorkflows();
    assert.deepStrictEqual(workflows, []);
  });

  test("Should return empty array when workspace folders is empty", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value([]);
    const workflows = await service.listWorkflows();
    assert.deepStrictEqual(workflows, []);
  });

  test("Should show error when no workspace is open for runWorkflow", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);
    const showErrorStub = sandbox.stub(vscode.window, "showErrorMessage");

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: false,
    });

    assert.ok(showErrorStub.calledOnce);
    assert.ok(showErrorStub.firstCall.args[0].includes("No workspace folder"));
  });

  test("Should have isActInstalled method", () => {
    assert.strictEqual(typeof service.isActInstalled, "function");
  });

  test("Should have findActPath method", () => {
    assert.strictEqual(typeof service.findActPath, "function");
  });

  test("Should create terminal and send act command for runWorkflow", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").returns(true);
    sandbox.stub(service, "findActPath").returns("/usr/bin/act");

    const mockTerminal = {
      show: sandbox.stub(),
      sendText: sandbox.stub(),
    };
    sandbox.stub(vscode.window, "createTerminal").returns(mockTerminal as any);

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      job: "build",
      event: "push",
      dryRun: true,
      list: false,
    });

    assert.ok(mockTerminal.show.calledOnce);
    assert.ok(mockTerminal.sendText.calledOnce);

    const command = mockTerminal.sendText.firstCall.args[0] as string;
    assert.ok(command.startsWith('& "'), `Expected command to start with call operator, got: ${command}`);
    assert.ok(command.includes("/usr/bin/act"), `Expected full act path in command, got: ${command}`);
    assert.ok(command.includes("--workflows"), "Expected --workflows flag");
    assert.ok(command.includes("--job"), "Expected --job flag");
    assert.ok(command.includes("--dryrun"), "Expected --dryrun flag");
    assert.ok(command.includes("--platform"), "Expected --platform flag");
    assert.ok(command.includes("push"), "Expected push event");
  });

  test("Should not include --job flag when job is not specified", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").returns(true);
    sandbox.stub(service, "findActPath").returns("/usr/bin/act");

    const mockTerminal = {
      show: sandbox.stub(),
      sendText: sandbox.stub(),
    };
    sandbox.stub(vscode.window, "createTerminal").returns(mockTerminal as any);

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: false,
    });

    const command = mockTerminal.sendText.firstCall.args[0] as string;
    assert.ok(!command.includes("--job"), "Should not include --job flag");
    assert.ok(!command.includes("--dryrun"), "Should not include --dryrun flag");
  });

  test("Should use --list flag when list is true", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").returns(true);
    sandbox.stub(service, "findActPath").returns("/usr/bin/act");

    const mockTerminal = {
      show: sandbox.stub(),
      sendText: sandbox.stub(),
    };
    sandbox.stub(vscode.window, "createTerminal").returns(mockTerminal as any);

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: true,
    });

    const command = mockTerminal.sendText.firstCall.args[0] as string;
    assert.ok(command.includes("--list"), "Expected --list flag");
    // In list mode, event should NOT be included
    assert.ok(!command.includes("push"), "Should not include event in list mode");
  });

  // ============================================================================
  // buildActArgs unit tests (pure logic, no VS Code stubs needed)
  // ============================================================================

  test("buildActArgs should produce correct args for a standard run", () => {
    const args = service.buildActArgs(
      { workflowFile: ".github/workflows/ci.yml", event: "push", dryRun: false, list: false },
      "/workspace/.github/workflows/ci.yml",
      "/workspace"
    );

    assert.ok(args.includes("push"), "Should include event");
    assert.ok(args.includes("--workflows"), "Should include --workflows");
    assert.ok(args.includes("--platform"), "Should include --platform");
    assert.ok(!args.includes("--dryrun"), "Should not include --dryrun");
    assert.ok(!args.includes("--list"), "Should not include --list");
    assert.ok(!args.includes("--job"), "Should not include --job");
  });

  test("buildActArgs should include --job when job is specified", () => {
    const args = service.buildActArgs(
      { workflowFile: ".github/workflows/ci.yml", event: "push", job: "test", dryRun: false, list: false },
      "/workspace/.github/workflows/ci.yml",
      "/workspace"
    );

    assert.ok(args.includes("--job"), "Should include --job flag");
  });

  test("buildActArgs should include --dryrun when dryRun is true", () => {
    const args = service.buildActArgs(
      { workflowFile: ".github/workflows/ci.yml", event: "push", dryRun: true, list: false },
      "/workspace/.github/workflows/ci.yml",
      "/workspace"
    );

    assert.ok(args.includes("--dryrun"), "Should include --dryrun flag");
  });

  test("buildActArgs should produce list-only args when list is true", () => {
    const args = service.buildActArgs(
      { workflowFile: ".github/workflows/ci.yml", event: "push", dryRun: false, list: true },
      "/workspace/.github/workflows/ci.yml",
      "/workspace"
    );

    assert.ok(args.includes("--list"), "Should include --list flag");
    assert.ok(args.includes("--workflows"), "Should include --workflows flag");
    assert.ok(!args.includes("push"), "Should not include event in list mode");
    assert.ok(!args.includes("--platform"), "Should not include --platform in list mode");
  });

  test("buildActArgs should support workflow_dispatch event", () => {
    const args = service.buildActArgs(
      { workflowFile: ".github/workflows/deploy.yml", event: "workflow_dispatch", dryRun: false, list: false },
      "/workspace/.github/workflows/deploy.yml",
      "/workspace"
    );

    assert.ok(args.includes("workflow_dispatch"), "Should include workflow_dispatch event");
  });

  test("Should prompt to install act when not found", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "findActPath").returns(undefined);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").returns(true);

    // User dismisses the dialog
    const warningStub = sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
    const errorStub = sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
    const createTerminalStub = sandbox.stub(vscode.window, "createTerminal");

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: false,
    });

    // Should NOT have created a terminal to run act
    assert.ok(
      createTerminalStub.notCalled || warningStub.called || errorStub.called,
      "Should prompt user about missing act instead of running"
    );
  });

  // ============================================================================
  // Docker availability tests
  // ============================================================================

  test("Should have isDockerInstalled method", () => {
    assert.strictEqual(typeof service.isDockerInstalled, "function");
  });

  test("Should have isDockerRunning method", () => {
    assert.strictEqual(typeof service.isDockerRunning, "function");
  });

  test("Should show error when Docker is not installed", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(false);

    const errorStub = sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
    const createTerminalStub = sandbox.stub(vscode.window, "createTerminal");

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: false,
    });

    assert.ok(errorStub.calledOnce, "Should show error message");
    assert.ok(
      errorStub.firstCall.args[0].includes("Docker is required"),
      "Error message should mention Docker is required"
    );
    assert.ok(createTerminalStub.notCalled, "Should not create terminal");
  });

  test("Should open Docker install page when user clicks action", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(false);

    sandbox.stub(vscode.window, "showErrorMessage").resolves("Open Docker Install Page" as any);
    const openExternalStub = sandbox.stub(vscode.env, "openExternal");

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: false,
    });

    assert.ok(openExternalStub.calledOnce, "Should open external URL");
  });

  test("Should show error when Docker is installed but not running", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").returns(false);

    const errorStub = sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
    const createTerminalStub = sandbox.stub(vscode.window, "createTerminal");

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: false,
    });

    assert.ok(errorStub.calledOnce, "Should show error message");
    assert.ok(
      errorStub.firstCall.args[0].includes("not running"),
      "Error message should mention Docker is not running"
    );
    assert.ok(createTerminalStub.notCalled, "Should not create terminal");
  });

  test("Should proceed when Docker is installed and running", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").returns(true);
    sandbox.stub(service, "findActPath").returns("/usr/bin/act");

    const mockTerminal = {
      show: sandbox.stub(),
      sendText: sandbox.stub(),
    };
    sandbox.stub(vscode.window, "createTerminal").returns(mockTerminal as any);

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: false,
    });

    assert.ok(mockTerminal.show.calledOnce, "Should create and show terminal");
    assert.ok(mockTerminal.sendText.calledOnce, "Should send act command");
  });
});
