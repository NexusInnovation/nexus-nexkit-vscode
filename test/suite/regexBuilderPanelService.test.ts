import * as assert from "assert";
import * as fs from "fs";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { RegexBuilderPanelService } from "../../src/features/regex-builder/regexBuilderPanelService";

suite("Unit: RegexBuilderPanelService", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Should create panel and inject webview placeholders", () => {
    sandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as any);
    const webview = {
      cspSource: "vscode-webview://test",
      html: "",
      asWebviewUri: sandbox.stub().callsFake((uri: vscode.Uri) => vscode.Uri.parse(`webview:${uri.path}`)),
    };
    const panel = {
      webview,
      reveal: sandbox.stub(),
      dispose: sandbox.stub(),
      onDidDispose: sandbox.stub().returns(new vscode.Disposable(() => {})),
    };
    const createPanelStub = sandbox.stub(vscode.window, "createWebviewPanel").returns(panel as any);
    const service = new RegexBuilderPanelService(vscode.Uri.file("/mock/extension"));

    service.openPanel();

    assert.ok(createPanelStub.calledOnce);
    assert.ok(webview.html.includes("webview:/mock/extension/out/regexBuilder.js"));
    assert.ok(webview.html.includes("vscode-webview://test"));
    assert.ok(!webview.html.includes("{{nonce}}"));
  });
});
