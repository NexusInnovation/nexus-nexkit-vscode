import * as assert from "assert";
import * as fs from "fs";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { CronScheduleBuilderPanelService } from "../../src/features/cron-schedule-builder/cronScheduleBuilderPanelService";

suite("Unit: CronScheduleBuilderPanelService", () => {
  let sandbox: sinon.SinonSandbox;
  let service: CronScheduleBuilderPanelService;
  let panelDisposeListener: (() => void) | undefined;

  setup(() => {
    sandbox = sinon.createSandbox();
    service = new CronScheduleBuilderPanelService(vscode.Uri.file("/mock/extension"));
    panelDisposeListener = undefined;
  });

  teardown(() => {
    sandbox.restore();
  });

  function createPanel() {
    const webview = {
      cspSource: "vscode-webview://test",
      html: "",
      asWebviewUri: sandbox.stub().callsFake((uri: vscode.Uri) => vscode.Uri.parse(`webview:${uri.path}`)),
    };
    return {
      webview,
      reveal: sandbox.stub(),
      dispose: sandbox.stub(),
      onDidDispose: sandbox.stub().callsFake((listener: () => void) => {
        panelDisposeListener = listener;
        return new vscode.Disposable(() => {});
      }),
    };
  }

  test("creates a panel and injects webview placeholders", () => {
    sandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as any);
    const panel = createPanel();
    const createPanelStub = sandbox.stub(vscode.window, "createWebviewPanel").returns(panel as any);

    service.openPanel();

    assert.ok(createPanelStub.calledOnce);
    assert.ok(panel.webview.html.includes("webview:/mock/extension/out/cronScheduleBuilder.js"));
    assert.ok(panel.webview.html.includes("vscode-webview://test"));
    assert.ok(!panel.webview.html.includes("{{nonce}}"));
  });

  test("reveals an existing panel and recreates it after disposal", () => {
    sandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as any);
    const panel = createPanel();
    const createPanelStub = sandbox.stub(vscode.window, "createWebviewPanel").returns(panel as any);

    service.openPanel();
    service.openPanel();
    assert.ok(createPanelStub.calledOnce);
    assert.ok(panel.reveal.calledOnceWithExactly(vscode.ViewColumn.Active));

    panelDisposeListener?.();
    service.openPanel();
    assert.ok(createPanelStub.calledTwice);
  });
});
