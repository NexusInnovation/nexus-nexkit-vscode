import * as assert from "assert";
import * as fs from "fs";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  JsonFormatterPanelActions,
  JsonFormatterPanelService,
} from "../../src/features/json-formatter/jsonFormatterPanelService";

suite("Unit: JsonFormatterPanelService", () => {
  let sandbox: sinon.SinonSandbox;
  let service: JsonFormatterPanelService;
  let panelDisposeListener: (() => void) | undefined;
  let messageListener: ((message: unknown) => Promise<void>) | undefined;

  setup(() => {
    sandbox = sinon.createSandbox();
    service = new JsonFormatterPanelService(vscode.Uri.file("/mock/extension"));
    panelDisposeListener = undefined;
    messageListener = undefined;
  });

  teardown(() => {
    sandbox.restore();
  });

  test("creates a panel, injects placeholders, and receives messages", () => {
    sandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as never);
    const webview = {
      cspSource: "vscode-webview://test",
      html: "",
      asWebviewUri: sandbox.stub().callsFake((uri: vscode.Uri) => vscode.Uri.parse(`webview:${uri.path}`)),
      onDidReceiveMessage: sandbox.stub().callsFake((listener: (message: unknown) => Promise<void>) => {
        messageListener = listener;
        return new vscode.Disposable(() => {});
      }),
    };
    const panel = {
      webview,
      reveal: sandbox.stub(),
      dispose: sandbox.stub(),
      onDidDispose: sandbox.stub().callsFake((listener: () => void) => {
        panelDisposeListener = listener;
        return new vscode.Disposable(() => {});
      }),
    };
    const createPanel = sandbox.stub(vscode.window, "createWebviewPanel").returns(panel as never);

    service.openPanel();

    assert.ok(createPanel.calledOnce);
    assert.ok(webview.html.includes("webview:/mock/extension/out/jsonFormatter.js"));
    assert.ok(webview.html.includes("vscode-webview://test"));
    assert.ok(!webview.html.includes("{{nonce}}"));
    assert.ok(messageListener);
  });

  test("copies formatted JSON from a webview message", async () => {
    const copyToClipboard = sandbox.stub().resolves();
    const showInformationMessage = sandbox.stub();
    service = createServiceWithActions({ copyToClipboard, showInformationMessage });
    openPanelForMessageTests(sandbox, service, (listener) => {
      messageListener = listener;
    });

    await messageListener?.({ command: "copy", formattedJson: '{\n  "value": true\n}' });

    assert.ok(copyToClipboard.calledOnceWithExactly('{\n  "value": true\n}'));
    assert.ok(showInformationMessage.calledWith("Formatted JSON copied to clipboard."));
  });

  test("saves formatted JSON when a location is selected", async () => {
    const fileUri = vscode.Uri.file("/mock/formatted.json");
    const showSaveDialog = sandbox.stub().resolves(fileUri);
    const writeFile = sandbox.stub().resolves();
    const showInformationMessage = sandbox.stub();
    service = createServiceWithActions({ showSaveDialog, writeFile, showInformationMessage });
    openPanelForMessageTests(sandbox, service, (listener) => {
      messageListener = listener;
    });

    await messageListener?.({ command: "save", formattedJson: "{}" });

    assert.ok(showSaveDialog.calledOnce);
    assert.ok(writeFile.calledOnceWithExactly(fileUri, Buffer.from("{}", "utf8")));
    assert.ok(showInformationMessage.calledWith("Formatted JSON saved."));
  });

  test("does not write a file when the save dialog is cancelled", async () => {
    const showSaveDialog = sandbox.stub().resolves(undefined);
    const writeFile = sandbox.stub().resolves();
    service = createServiceWithActions({ showSaveDialog, writeFile });
    openPanelForMessageTests(sandbox, service, (listener) => {
      messageListener = listener;
    });

    await messageListener?.({ command: "save", formattedJson: "{}" });

    assert.ok(writeFile.notCalled);
  });

  test("ignores malformed webview messages", async () => {
    const copyToClipboard = sandbox.stub().resolves();
    const showSaveDialog = sandbox.stub().resolves(undefined);
    service = createServiceWithActions({ copyToClipboard, showSaveDialog });
    openPanelForMessageTests(sandbox, service, (listener) => {
      messageListener = listener;
    });

    await messageListener?.({ command: "save" });

    assert.ok(copyToClipboard.notCalled);
    assert.ok(showSaveDialog.notCalled);
  });

  test("reveals the existing panel and clears it after disposal", () => {
    sandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as never);
    const reveal = sandbox.stub();
    const panel = {
      webview: {
        cspSource: "vscode-webview://test",
        html: "",
        asWebviewUri: sandbox.stub().returns(vscode.Uri.parse("webview:/out/jsonFormatter.js")),
        onDidReceiveMessage: sandbox.stub().callsFake(() => new vscode.Disposable(() => {})),
      },
      reveal,
      dispose: sandbox.stub(),
      onDidDispose: sandbox.stub().callsFake((listener: () => void) => {
        panelDisposeListener = listener;
        return new vscode.Disposable(() => {});
      }),
    };
    const createPanel = sandbox.stub(vscode.window, "createWebviewPanel").returns(panel as never);

    service.openPanel();
    service.openPanel();
    panelDisposeListener?.();
    service.openPanel();

    assert.ok(createPanel.calledTwice);
    assert.ok(reveal.calledOnceWithExactly(vscode.ViewColumn.Active));
  });

  function openPanelForMessageTests(
    testSandbox: sinon.SinonSandbox,
    panelService: JsonFormatterPanelService,
    setMessageListener: (listener: (message: unknown) => Promise<void>) => void
  ): void {
    testSandbox.stub(fs, "readFileSync").returns("<html>{{nonce}}|{{scriptUri}}|{{cspSource}}</html>" as never);
    const panel = {
      webview: {
        cspSource: "vscode-webview://test",
        html: "",
        asWebviewUri: testSandbox.stub().returns(vscode.Uri.parse("webview:/out/jsonFormatter.js")),
        onDidReceiveMessage: testSandbox.stub().callsFake((listener: (message: unknown) => Promise<void>) => {
          setMessageListener(listener);
          return new vscode.Disposable(() => {});
        }),
      },
      reveal: testSandbox.stub(),
      dispose: testSandbox.stub(),
      onDidDispose: testSandbox.stub().callsFake(() => new vscode.Disposable(() => {})),
    };
    testSandbox.stub(vscode.window, "createWebviewPanel").returns(panel as never);

    panelService.openPanel();
  }

  function createServiceWithActions(overrides: Partial<JsonFormatterPanelActions>): JsonFormatterPanelService {
    const actions: JsonFormatterPanelActions = {
      copyToClipboard: async () => {},
      showSaveDialog: async () => undefined,
      writeFile: async () => {},
      showInformationMessage: () => {},
      ...overrides,
    };
    return new JsonFormatterPanelService(vscode.Uri.file("/mock/extension"), actions);
  }
});