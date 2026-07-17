import * as assert from "assert";
import * as fs from "fs";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { RtfConverterPanelService } from "../../src/features/rtf-converter/rtfConverterPanelService";

suite("Unit: RtfConverterPanelService", () => {
  let sandbox: sinon.SinonSandbox;
  let service: RtfConverterPanelService;
  let panelDisposeListener: (() => void) | undefined;

  setup(() => {
    sandbox = sinon.createSandbox();
    service = new RtfConverterPanelService(vscode.Uri.file("/mock/extension"));
    panelDisposeListener = undefined;
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Should create panel and inject webview placeholders", () => {
    sandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as any);

    const revealStub = sandbox.stub();
    const panelDisposeStub = sandbox.stub();
    const webview = {
      cspSource: "vscode-webview://test",
      html: "",
      asWebviewUri: sandbox.stub().callsFake((uri: vscode.Uri) => vscode.Uri.parse(`webview:${uri.path}`)),
    };
    const panel = {
      webview,
      reveal: revealStub,
      dispose: panelDisposeStub,
      onDidDispose: sandbox.stub().callsFake((listener: () => void) => {
        panelDisposeListener = listener;
        return new vscode.Disposable(() => {});
      }),
    };

    const createPanelStub = sandbox.stub(vscode.window, "createWebviewPanel").returns(panel as any);

    service.openPanel();

    assert.ok(createPanelStub.calledOnce);
    assert.ok(typeof webview.html === "string" && webview.html.includes("webview:/mock/extension/out/rtfConverter.js"));
    assert.ok(webview.html.includes("vscode-webview://test"));
    assert.ok(!webview.html.includes("{{nonce}}"));
    assert.ok(revealStub.notCalled);
  });

  test("Should reveal existing panel instead of creating a second one", () => {
    sandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as any);
    const revealStub = sandbox.stub();
    const panel = {
      webview: {
        cspSource: "vscode-webview://test",
        html: "",
        asWebviewUri: sandbox.stub().returns(vscode.Uri.parse("webview:/out/rtfConverter.js")),
      },
      reveal: revealStub,
      dispose: sandbox.stub(),
      onDidDispose: sandbox.stub().callsFake((listener: () => void) => {
        panelDisposeListener = listener;
        return new vscode.Disposable(() => {});
      }),
    };
    const createPanelStub = sandbox.stub(vscode.window, "createWebviewPanel").returns(panel as any);

    service.openPanel();
    service.openPanel();

    assert.ok(createPanelStub.calledOnce);
    assert.ok(revealStub.calledOnceWithExactly(vscode.ViewColumn.Active));
  });

  test("Should clear panel reference when disposed", () => {
    sandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as any);
    const revealStub = sandbox.stub();
    const panel = {
      webview: {
        cspSource: "vscode-webview://test",
        html: "",
        asWebviewUri: sandbox.stub().returns(vscode.Uri.parse("webview:/out/rtfConverter.js")),
      },
      reveal: revealStub,
      dispose: sandbox.stub(),
      onDidDispose: sandbox.stub().callsFake((listener: () => void) => {
        panelDisposeListener = listener;
        return new vscode.Disposable(() => {});
      }),
    };
    const createPanelStub = sandbox.stub(vscode.window, "createWebviewPanel").returns(panel as any);

    service.openPanel();
    panelDisposeListener?.();
    service.openPanel();

    assert.ok(createPanelStub.calledTwice);
    assert.ok(revealStub.notCalled);
  });
});
