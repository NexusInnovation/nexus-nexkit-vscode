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
    service = new GitHubWorkflowRunnerService(vscode.Uri.file("/mock/extension"));
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
    sandbox.stub(service, "isDockerRunning").resolves(true);
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
    const isWindows = process.platform === "win32";
    if (isWindows) {
      assert.ok(command.startsWith('& "'), `Expected PowerShell call operator, got: ${command}`);
      assert.ok(command.includes("Run-GitHubWorkflow.ps1"), `Expected PS script in command, got: ${command}`);
      assert.ok(command.includes("-WorkflowFile"), "Expected -WorkflowFile flag");
      assert.ok(command.includes("-Job"), "Expected -Job flag");
      assert.ok(command.includes("-DryRun"), "Expected -DryRun flag");
    } else {
      assert.ok(command.startsWith('bash "'), `Expected bash invocation, got: ${command}`);
      assert.ok(command.includes("run-github-workflow.sh"), `Expected shell script in command, got: ${command}`);
      assert.ok(command.includes("--workflow-file"), "Expected --workflow-file flag");
      assert.ok(command.includes("--job"), "Expected --job flag");
      assert.ok(command.includes("--dry-run"), "Expected --dry-run flag");
    }
    assert.ok(command.includes("push"), "Expected push event");
  });

  test("Should not include --job flag when job is not specified", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").resolves(true);
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
    const isWindows = process.platform === "win32";
    if (isWindows) {
      assert.ok(!command.includes("-Job"), "Should not include -Job flag");
      assert.ok(!command.includes("-DryRun"), "Should not include -DryRun flag");
    } else {
      assert.ok(!command.includes("--job"), "Should not include --job flag");
      assert.ok(!command.includes("--dry-run"), "Should not include --dry-run flag");
    }
  });

  test("Should use --list flag when list is true", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").resolves(true);
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
    const isWindows = process.platform === "win32";
    if (isWindows) {
      assert.ok(command.includes("-List"), "Expected -List flag");
    } else {
      assert.ok(command.includes("--list"), "Expected --list flag");
    }
  });

  // ============================================================================
  // buildActArgs unit tests (pure logic, no VS Code stubs needed)
  // ============================================================================

  test("buildActArgs should produce correct args for a standard run", () => {
    const workflowPath = "/workspace/.github/workflows/ci.yml";
    const workspaceRoot = "/workspace";

    const args = service.buildActArgs(
      { workflowFile: ".github/workflows/ci.yml", event: "push", dryRun: false, list: false },
      workflowPath,
      workspaceRoot
    );

    // Event should be present and in the first position
    assert.ok(args.includes("push"), "Should include event");
    assert.strictEqual(args[0], "push", "Event should be the first argument");

    // --workflows flag should be present and immediately followed by the workflow file path
    const workflowsIndex = args.indexOf("--workflows");
    assert.notStrictEqual(workflowsIndex, -1, "Should include --workflows");
    assert.strictEqual(args[workflowsIndex + 1], workflowPath, "Workflow path should follow --workflows flag");

    // Platform mappings: three mappings with correct format and order
    const platformFlagIndices = args
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value === "--platform")
      .map((entry) => entry.index);

    assert.strictEqual(platformFlagIndices.length, 3, "Should include 3 --platform mappings (ubuntu, windows, macos)");

    const platformMappings = platformFlagIndices.map((i) => args[i + 1]);

    // Ensure mappings are in the expected label=image format
    assert.deepStrictEqual(
      platformMappings,
      [
        "ubuntu-latest=catthehacker/ubuntu:act-latest",
        "windows-latest=catthehacker/ubuntu:act-latest",
        "macos-latest=catthehacker/ubuntu:act-latest",
      ],
      "Platform mappings should be in the expected format and order"
    );

    // Artifact server path should be present and include the workspace root
    const artifactIndex = args.indexOf("--artifact-server-path");
    assert.notStrictEqual(artifactIndex, -1, "Should include --artifact-server-path");
    const artifactPath = args[artifactIndex + 1];
    assert.ok(
      typeof artifactPath === "string" && artifactPath.includes(workspaceRoot),
      "Artifact path should include workspace root"
    );

    // Flags that should NOT be present for a standard run
    assert.ok(!args.includes("--dryrun"), "Should not include --dryrun");
    assert.ok(!args.includes("--list"), "Should not include --list");
    assert.ok(!args.includes("--job"), "Should not include --job");
  });

  test("buildActArgs should include --job when job is specified", () => {
    const workflowPath = "/workspace/.github/workflows/ci.yml";
    const workspaceRoot = "/workspace";

    const args = service.buildActArgs(
      { workflowFile: ".github/workflows/ci.yml", event: "push", job: "test", dryRun: false, list: false },
      workflowPath,
      workspaceRoot
    );

    const jobIndex = args.indexOf("--job");
    assert.notStrictEqual(jobIndex, -1, "Should include --job flag");
    assert.strictEqual(args[jobIndex + 1], "test", "Job name should follow --job flag");
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
    sandbox.stub(service, "isDockerRunning").resolves(true);

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
    assert.ok(errorStub.firstCall.args[0].includes("Docker is required"), "Error message should mention Docker is required");
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
    sandbox.stub(service, "isDockerRunning").resolves(false);

    const errorStub = sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
    const createTerminalStub = sandbox.stub(vscode.window, "createTerminal");

    await service.runWorkflow({
      workflowFile: ".github/workflows/ci.yml",
      event: "push",
      dryRun: false,
      list: false,
    });

    assert.ok(errorStub.calledOnce, "Should show error message");
    assert.ok(errorStub.firstCall.args[0].includes("not running"), "Error message should mention Docker is not running");
    assert.ok(createTerminalStub.notCalled, "Should not create terminal");
  });

  test("Should proceed when Docker is installed and running", async () => {
    const mockUri = vscode.Uri.file("/mock/workspace");
    sandbox.stub(vscode.workspace, "workspaceFolders").value([{ uri: mockUri, name: "mock", index: 0 }]);
    sandbox.stub(service, "isDockerInstalled").returns(true);
    sandbox.stub(service, "isDockerRunning").resolves(true);
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
