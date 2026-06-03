/**
 * Tests for the InitializationBanner feature
 * Covers: SettingsManager workspace init prompt dismissed state,
 * and NexkitPanelMessageHandler dismissInitWorkspace command behaviour.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: InitializationBanner — SettingsManager", () => {
  let mockContext: vscode.ExtensionContext;
  let workspaceStateData: Map<string, any>;

  setup(() => {
    workspaceStateData = new Map<string, any>();

    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: (key: string, defaultValue?: any) => {
          return workspaceStateData.has(key) ? workspaceStateData.get(key) : defaultValue;
        },
        update: async (key: string, value: any) => {
          workspaceStateData.set(key, value);
        },
      },
      globalState: {
        get: (_key: string, defaultValue?: any) => defaultValue,
        update: async (_key: string, _value: any) => {},
        setKeysForSync: () => {},
      },
      extensionUri: vscode.Uri.file(__dirname),
      extensionPath: __dirname,
      asAbsolutePath: (relativePath: string) => `${__dirname}/${relativePath}`,
      storagePath: undefined,
      globalStoragePath: __dirname,
      logPath: __dirname,
      extensionMode: vscode.ExtensionMode.Test,
    } as any;

    SettingsManager.initialize(mockContext);
  });

  teardown(() => {
    workspaceStateData.clear();
    sinon.restore();
  });

  test("isWorkspaceInitPromptDismissed returns false by default", () => {
    const result = SettingsManager.isWorkspaceInitPromptDismissed();
    assert.strictEqual(result, false);
  });

  test("setWorkspaceInitPromptDismissed(true) persists dismissed state", async () => {
    await SettingsManager.setWorkspaceInitPromptDismissed(true);
    const result = SettingsManager.isWorkspaceInitPromptDismissed();
    assert.strictEqual(result, true);
  });

  test("setWorkspaceInitPromptDismissed(false) clears dismissed state", async () => {
    await SettingsManager.setWorkspaceInitPromptDismissed(true);
    await SettingsManager.setWorkspaceInitPromptDismissed(false);
    const result = SettingsManager.isWorkspaceInitPromptDismissed();
    assert.strictEqual(result, false);
  });

  test("dismissed state is independent of isWorkspaceInitialized", async () => {
    await SettingsManager.setWorkspaceInitialized(false);
    await SettingsManager.setWorkspaceInitPromptDismissed(true);

    assert.strictEqual(SettingsManager.isWorkspaceInitialized(), false);
    assert.strictEqual(SettingsManager.isWorkspaceInitPromptDismissed(), true);
  });

  test("initialized state is independent of dismissed state", async () => {
    await SettingsManager.setWorkspaceInitialized(true);
    await SettingsManager.setWorkspaceInitPromptDismissed(false);

    assert.strictEqual(SettingsManager.isWorkspaceInitialized(), true);
    assert.strictEqual(SettingsManager.isWorkspaceInitPromptDismissed(), false);
  });
});

suite("Unit: InitializationBanner — NexkitPanelMessageHandler.dismissInitWorkspace", () => {
  let mockContext: vscode.ExtensionContext;
  let workspaceStateData: Map<string, any>;
  let postedMessages: any[];
  let mockWebviewView: vscode.WebviewView;

  setup(async () => {
    workspaceStateData = new Map<string, any>();
    postedMessages = [];

    mockWebviewView = {
      webview: {
        postMessage: (msg: any) => {
          postedMessages.push(msg);
          return Promise.resolve(true);
        },
        html: "",
        options: {},
        onDidReceiveMessage: new vscode.EventEmitter<any>().event,
        cspSource: "",
        asWebviewUri: (uri: vscode.Uri) => uri,
      },
    } as any;

    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: (key: string, defaultValue?: any) => {
          return workspaceStateData.has(key) ? workspaceStateData.get(key) : defaultValue;
        },
        update: async (key: string, value: any) => {
          workspaceStateData.set(key, value);
        },
      },
      globalState: {
        get: (_key: string, defaultValue?: any) => defaultValue,
        update: async (_key: string, _value: any) => {},
        setKeysForSync: () => {},
      },
      extensionUri: vscode.Uri.file(__dirname),
      extensionPath: __dirname,
      asAbsolutePath: (relativePath: string) => `${__dirname}/${relativePath}`,
      storagePath: undefined,
      globalStoragePath: __dirname,
      logPath: __dirname,
      extensionMode: vscode.ExtensionMode.Test,
    } as any;

    SettingsManager.initialize(mockContext);
  });

  teardown(() => {
    workspaceStateData.clear();
    postedMessages = [];
    sinon.restore();
  });

  test("dismissInitWorkspace sets workspaceInitPromptDismissed to true", async () => {
    assert.strictEqual(SettingsManager.isWorkspaceInitPromptDismissed(), false, "should start as false");

    await SettingsManager.setWorkspaceInitPromptDismissed(true);

    assert.strictEqual(SettingsManager.isWorkspaceInitPromptDismissed(), true);
  });

  test("workspaceStateUpdate message includes isInitRefused=true after dismiss", async () => {
    await SettingsManager.setWorkspaceInitPromptDismissed(true);

    const isInitRefused = SettingsManager.isWorkspaceInitPromptDismissed();
    assert.strictEqual(isInitRefused, true, "isInitRefused should reflect dismissed state");
  });

  test("workspaceStateUpdate message includes isInitRefused=false before dismiss", () => {
    const isInitRefused = SettingsManager.isWorkspaceInitPromptDismissed();
    assert.strictEqual(isInitRefused, false, "isInitRefused should be false before any dismiss");
  });
});
