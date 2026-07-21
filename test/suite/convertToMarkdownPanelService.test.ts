/**
 * Tests for ConvertToMarkdownPanelService
 * Manages the standalone "Convert to Markdown" webview panel.
 *
 * The conversion service dependency is a Sinon-stubbed fake satisfying
 * IMarkitdownConversionService — the real MarkitdownConversionService (which spawns
 * a Python subprocess) is never used here.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ConvertToMarkdownPanelService } from "../../src/features/convert-to-markdown/convertToMarkdownPanelService";
import { IMarkitdownConversionService, MarkitdownAvailability } from "../../src/features/convert-to-markdown/markitdownConversionService";
import { WebviewToHostMessage, HostToWebviewMessage } from "../../src/features/convert-to-markdown/messages";

/** Waits for all currently pending microtasks (promise chains) to settle. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface FakeConversionService extends IMarkitdownConversionService {
  checkAvailability: sinon.SinonStub<[], Promise<MarkitdownAvailability>>;
  invalidateAvailabilityCache: sinon.SinonStub<[], void>;
  convertHtml: sinon.SinonStub<[string], Promise<string>>;
  convertText: sinon.SinonStub<[string], Promise<string>>;
  convertFile: sinon.SinonStub<[string, Uint8Array], Promise<string>>;
}

function createFakeConversionService(): FakeConversionService {
  return {
    checkAvailability: sinon.stub<[], Promise<MarkitdownAvailability>>().resolves({ available: true }),
    invalidateAvailabilityCache: sinon.stub<[], void>(),
    convertHtml: sinon.stub<[string], Promise<string>>().resolves("converted html"),
    convertText: sinon.stub<[string], Promise<string>>().resolves("converted text"),
    convertFile: sinon.stub<[string, Uint8Array], Promise<string>>().resolves("converted file"),
  };
}

interface FakePanelHandle {
  panel: vscode.WebviewPanel;
  messageListeners: Array<(message: WebviewToHostMessage) => void>;
  disposeListeners: Array<() => void>;
  postMessageStub: sinon.SinonStub;
  revealStub: sinon.SinonStub;
  disposeStub: sinon.SinonStub;
}

function createFakePanel(): FakePanelHandle {
  const messageListeners: Array<(message: WebviewToHostMessage) => void> = [];
  const disposeListeners: Array<() => void> = [];
  const postMessageStub = sinon.stub().resolves(true);
  const revealStub = sinon.stub();
  const disposeStub = sinon.stub();

  const webview = {
    html: "",
    cspSource: "vscode-resource:",
    asWebviewUri: (uri: vscode.Uri) => uri,
    postMessage: postMessageStub,
    onDidReceiveMessage: (listener: (message: WebviewToHostMessage) => void) => {
      messageListeners.push(listener);
      return { dispose: () => undefined };
    },
  };

  const panel = {
    webview,
    reveal: revealStub,
    dispose: disposeStub,
    onDidDispose: (listener: () => void) => {
      disposeListeners.push(listener);
      return { dispose: () => undefined };
    },
  } as unknown as vscode.WebviewPanel;

  return { panel, messageListeners, disposeListeners, postMessageStub, revealStub, disposeStub };
}

suite("Unit: ConvertToMarkdownPanelService", () => {
  let createWebviewPanelStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let fakePanel: FakePanelHandle;
  let conversionService: FakeConversionService;
  let service: ConvertToMarkdownPanelService;

  setup(() => {
    fakePanel = createFakePanel();
    createWebviewPanelStub = sinon.stub(vscode.window, "createWebviewPanel").returns(fakePanel.panel);
    showErrorMessageStub = sinon.stub(vscode.window, "showErrorMessage").resolves(undefined);
    conversionService = createFakeConversionService();
    service = new ConvertToMarkdownPanelService(vscode.Uri.file(__dirname), conversionService);
  });

  teardown(() => {
    sinon.restore();
  });

  test("openPanel creates a webview panel with the expected view type and title", () => {
    service.openPanel();

    assert.ok(createWebviewPanelStub.calledOnce);
    const [viewType, title] = createWebviewPanelStub.getCall(0).args;
    assert.strictEqual(viewType, "nexkitConvertToMarkdown");
    assert.strictEqual(title, "Nexkit: Convert to Markdown");
  });

  test("calling openPanel twice reveals the existing panel instead of creating a second one", () => {
    service.openPanel();
    service.openPanel();

    assert.ok(createWebviewPanelStub.calledOnce, "createWebviewPanel must only be called once");
    assert.ok(fakePanel.revealStub.calledOnce, "the existing panel must be revealed on the second call");
  });

  suite("onDidReceiveMessage handling", () => {
    setup(() => {
      service.openPanel();
    });

    test("webview-ready triggers an availability check and posts availability-status", async () => {
      conversionService.checkAvailability.resolves({ available: true });

      fakePanel.messageListeners[0]({ type: "webview-ready" });
      await flushMicrotasks();

      assert.ok(conversionService.checkAvailability.calledOnce);
      const posted = fakePanel.postMessageStub.getCall(0).args[0] as HostToWebviewMessage;
      assert.strictEqual(posted.type, "availability-status");
      assert.strictEqual((posted as { available: boolean }).available, true);
    });

    test("recheck-availability invalidates the cache before re-checking availability", async () => {
      conversionService.checkAvailability.resolves({ available: false, reason: "no interpreter" });

      fakePanel.messageListeners[0]({ type: "recheck-availability" });
      await flushMicrotasks();

      assert.ok(conversionService.invalidateAvailabilityCache.calledOnce);
      assert.ok(conversionService.checkAvailability.calledOnce);
      const posted = fakePanel.postMessageStub.getCall(0).args[0] as HostToWebviewMessage;
      assert.strictEqual(posted.type, "availability-status");
      assert.strictEqual((posted as { available: boolean }).available, false);
      assert.strictEqual((posted as { reason?: string }).reason, "no interpreter");
    });

    test("convert-paste-html calls convertHtml and posts a conversion-result", async () => {
      conversionService.convertHtml.resolves("# converted html");

      fakePanel.messageListeners[0]({ type: "convert-paste-html", html: "<p>hi</p>" });
      await flushMicrotasks();

      assert.ok(conversionService.convertHtml.calledOnceWithExactly("<p>hi</p>"));
      const posted = fakePanel.postMessageStub.getCall(0).args[0] as HostToWebviewMessage;
      assert.strictEqual(posted.type, "conversion-result");
      assert.strictEqual((posted as { markdown: string }).markdown, "# converted html");
      assert.strictEqual((posted as { sourceLabel: string }).sourceLabel, "Pasted HTML");
    });

    test("convert-paste-text calls convertText and posts a conversion-result", async () => {
      conversionService.convertText.resolves("# converted text");

      fakePanel.messageListeners[0]({ type: "convert-paste-text", text: "hello" });
      await flushMicrotasks();

      assert.ok(conversionService.convertText.calledOnceWithExactly("hello"));
      const posted = fakePanel.postMessageStub.getCall(0).args[0] as HostToWebviewMessage;
      assert.strictEqual(posted.type, "conversion-result");
      assert.strictEqual((posted as { markdown: string }).markdown, "# converted text");
      assert.strictEqual((posted as { sourceLabel: string }).sourceLabel, "Pasted text");
    });

    test("convert-file calls convertFile with the file name and bytes, and posts a conversion-result", async () => {
      const data = new Uint8Array([1, 2, 3]);
      conversionService.convertFile.resolves("# converted file");

      fakePanel.messageListeners[0]({ type: "convert-file", fileName: "report.docx", data });
      await flushMicrotasks();

      assert.ok(conversionService.convertFile.calledOnceWithExactly("report.docx", data));
      const posted = fakePanel.postMessageStub.getCall(0).args[0] as HostToWebviewMessage;
      assert.strictEqual(posted.type, "conversion-result");
      assert.strictEqual((posted as { markdown: string }).markdown, "# converted file");
      assert.strictEqual((posted as { sourceLabel: string }).sourceLabel, "report.docx");
    });

    test("a rejected conversion posts conversion-error and never produces an unhandled rejection", async () => {
      conversionService.convertText.rejects(new Error("boom"));

      assert.doesNotThrow(() => fakePanel.messageListeners[0]({ type: "convert-paste-text", text: "hello" }));
      await flushMicrotasks();

      const posted = fakePanel.postMessageStub.getCall(0).args[0] as HostToWebviewMessage;
      assert.strictEqual(posted.type, "conversion-error");
      assert.strictEqual((posted as { message: string }).message, "boom");
    });
  });

  suite("dispose", () => {
    test("dispose() disposes the panel and the message listener without throwing", () => {
      service.openPanel();

      assert.doesNotThrow(() => service.dispose());
      assert.ok(fakePanel.disposeStub.calledOnce);
    });

    test("dispose() is safe to call when no panel is open", () => {
      assert.doesNotThrow(() => service.dispose());
      assert.ok(createWebviewPanelStub.notCalled);
    });
  });
});
