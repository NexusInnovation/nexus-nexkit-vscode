/**
 * Test double for the VS Code webview API bridge (`acquireVsCodeApi`).
 *
 * The real bridge is injected by VS Code into the webview global scope; the
 * {@link VSCodeMessenger} calls `acquireVsCodeApi()` once and posts messages
 * through it. These helpers install a stable mock bridge, capture every posted
 * `WebviewMessage`, and simulate extension → webview messages by dispatching a
 * `MessageEvent` on the happy-dom window (exactly how VS Code delivers them).
 */

import { getHappyWindow } from "./domEnvironment";

/** Messages posted by the webview to the extension host, newest last. */
let postedMessages: unknown[] = [];

/** Opaque state persisted through `setState` / `getState`. */
let persistedState: unknown;

/**
 * Install the `acquireVsCodeApi` global. The returned bridge is stable across
 * calls (VS Code returns the same object), so the messenger singleton keeps a
 * valid reference for the whole test run while {@link resetVsCodeApiMock} clears
 * the captured messages between tests.
 */
export function installVsCodeApiMock(): void {
  const bridge = {
    postMessage: (message: unknown): void => {
      postedMessages.push(message);
    },
    getState: (): unknown => persistedState,
    setState: (state: unknown): void => {
      persistedState = state;
    },
  };

  (globalThis as unknown as Record<string, unknown>).acquireVsCodeApi = () => bridge;
}

/** Clear captured messages and persisted state between tests. */
export function resetVsCodeApiMock(): void {
  postedMessages = [];
  persistedState = undefined;
}

/** All messages the webview has posted to the extension host, in order. */
export function getPostedMessages(): unknown[] {
  return postedMessages;
}

/** The most recently posted message, or `undefined` when none were posted. */
export function lastPostedMessage(): unknown {
  return postedMessages[postedMessages.length - 1];
}

/** Posted messages whose `command` matches {@link command}. */
export function postedMessagesOfCommand(command: string): Array<Record<string, unknown>> {
  return postedMessages.filter(
    (message): message is Record<string, unknown> =>
      typeof message === "object" && message !== null && (message as Record<string, unknown>).command === command
  );
}

/**
 * Deliver an extension → webview message exactly like VS Code does: a `message`
 * event on the window whose `data` is the message payload. The messenger's
 * global listener dispatches it to the registered command handlers.
 */
export function dispatchExtensionMessage(message: unknown): void {
  const window = getHappyWindow();
  const event = new window.MessageEvent("message", { data: message });
  window.dispatchEvent(event);
}
