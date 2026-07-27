import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { RepositorySyncStatusBarService } from "../../src/features/repository-sync/services/repositorySyncStatusBarService";

suite("Unit: RepositorySyncStatusBarService", () => {
  test("transitions from running to warning and includes trigger/timestamp in tooltip", () => {
    const setState = sinon.stub(vscode.window, "createStatusBarItem").returns({
      text: "",
      tooltip: "",
      backgroundColor: undefined,
      command: undefined,
      name: "",
      show: sinon.stub(),
      hide: sinon.stub(),
      dispose: sinon.stub(),
    } as unknown as vscode.StatusBarItem);

    const service = new RepositorySyncStatusBarService();
    service.setRunning();

    service.updateLastRun(
      {
        startedAt: 1000,
        completedAt: 2000,
        repositoryCount: 2,
        plannedCount: 2,
        processedCount: 2,
        results: [],
        summary: {
          total: 2,
          successReady: 1,
          skipped: 0,
          conflictRisk: 1,
          failed: 0,
          changed: 1,
        },
      },
      "manual-full-sync"
    );

    const statusBar = setState.firstCall.returnValue as unknown as vscode.StatusBarItem;
    assert.strictEqual(statusBar.text, "$(warning) Repo Sync");
    assert.ok(String(statusBar.tooltip).includes("Last run:"));
    assert.ok(String(statusBar.tooltip).includes("Trigger: manual-full-sync."));

    service.dispose();
    setState.restore();
  });

  test("transitions to error when failed count is non-zero", () => {
    const createStatusBarStub = sinon.stub(vscode.window, "createStatusBarItem").returns({
      text: "",
      tooltip: "",
      backgroundColor: undefined,
      command: undefined,
      name: "",
      show: sinon.stub(),
      hide: sinon.stub(),
      dispose: sinon.stub(),
    } as unknown as vscode.StatusBarItem);

    const service = new RepositorySyncStatusBarService();
    service.updateLastRun(
      {
        startedAt: 1000,
        completedAt: 2000,
        repositoryCount: 1,
        plannedCount: 1,
        processedCount: 1,
        results: [],
        summary: {
          total: 1,
          successReady: 0,
          skipped: 0,
          conflictRisk: 0,
          failed: 1,
          changed: 0,
        },
      },
      "manual-retry-failed"
    );

    const statusBar = createStatusBarStub.firstCall.returnValue as unknown as vscode.StatusBarItem;
    assert.strictEqual(statusBar.text, "$(error) Repo Sync");

    service.dispose();
    createStatusBarStub.restore();
  });
});
