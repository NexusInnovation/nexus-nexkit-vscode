/**
 * Pure message type definitions for the Convert to Markdown feature.
 * Contains zero runtime code so this module is safe to import from both
 * the extension host bundle and the (future) webview bundle.
 */

/**
 * Messages sent FROM the webview TO the extension host
 */
export type WebviewToHostMessage =
  | { type: "webview-ready" }
  | { type: "convert-paste-html"; html: string }
  | { type: "convert-paste-text"; text: string }
  | { type: "convert-file"; fileName: string; data: Uint8Array }
  | { type: "recheck-availability" };

/**
 * Messages sent FROM the extension host TO the webview
 */
export type HostToWebviewMessage =
  | { type: "availability-status"; available: boolean; reason?: string }
  | { type: "conversion-result"; markdown: string; sourceLabel: string }
  | { type: "conversion-error"; message: string };
