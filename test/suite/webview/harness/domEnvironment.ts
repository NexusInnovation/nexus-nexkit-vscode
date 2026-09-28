/**
 * Minimal DOM environment for the Preact webview tests.
 *
 * The extension test-suite runs inside the VS Code Electron host, which is a
 * Node.js environment with no DOM. Webview component/hook/context tests need a
 * browser-like `window`/`document`, so this module registers a lightweight
 * {@link https://github.com/capricorn86/happy-dom | happy-dom} environment on
 * the Node globals.
 *
 * It is deliberately kept out of the production bundle and the extension-host
 * runner: only the dedicated webview runner (`test/runWebviewTest.ts`) and the
 * webview test files load it, so registering DOM globals never affects the
 * extension-host tests.
 */

import { Window } from "happy-dom";

let happyWindow: Window | undefined;

/**
 * Register a happy-dom `window`/`document` (and the DOM-specific globals the
 * Preact renderer + Testing Library rely on) onto `globalThis`.
 *
 * Idempotent: the first call creates the environment; later calls are no-ops so
 * the same document/window instance is shared across every webview test (which
 * keeps the singleton VS Code messenger's `window` listener valid).
 *
 * Existing Node built-ins (`setTimeout`, `queueMicrotask`, `Promise`, `URL`, …)
 * are never clobbered — only DOM globals that Node lacks are filled in, plus the
 * core `window`/`self`/`document`/`navigator` references are pointed at the
 * happy-dom instances.
 */
export function registerDomEnvironment(): void {
  if (happyWindow) {
    return;
  }

  const window = new Window({ url: "http://localhost/" });
  happyWindow = window;

  const globalRecord = globalThis as unknown as Record<string, unknown>;
  const windowRecord = window as unknown as Record<string, unknown>;

  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalRecord) {
      // Preserve Node's own globals (timers, Promise, URL, Event, …) untouched.
      continue;
    }
    let value: unknown;
    try {
      value = windowRecord[key];
    } catch {
      continue;
    }
    try {
      globalRecord[key] = value;
    } catch {
      // Ignore read-only globals.
    }
  }

  const defineGlobal = (key: string, value: unknown): void => {
    try {
      globalRecord[key] = value;
    } catch {
      // Some Node globals (e.g. `navigator`) are getter-only; override via defineProperty.
      Object.defineProperty(globalRecord, key, { value, configurable: true, writable: true });
    }
  };

  defineGlobal("window", window);
  defineGlobal("self", window);
  defineGlobal("document", window.document);
  defineGlobal("navigator", window.navigator);
}

/**
 * The happy-dom {@link Window} registered by {@link registerDomEnvironment}.
 * Use it to construct DOM events (e.g. `MessageEvent`) bound to the same
 * document the components render into.
 *
 * @throws when the environment has not been registered yet.
 */
export function getHappyWindow(): Window {
  if (!happyWindow) {
    throw new Error("DOM environment not registered — call registerDomEnvironment() first.");
  }
  return happyWindow;
}
