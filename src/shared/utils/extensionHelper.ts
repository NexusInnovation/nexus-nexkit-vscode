import * as vscode from "vscode";

export const NEXKIT_EXTENSION_NAME = "nexus-nexkit-vscode";

/**
 * Find the Nexkit extension instance from the current VS Code extension host.
 * This avoids hard-coding publisher IDs which can vary between dev/test vs marketplace.
 */
export function getExtension() {
  return vscode.extensions.all.find((ext) => ext.packageJSON?.name === NEXKIT_EXTENSION_NAME);
}

/**
 * Get the current version of the Nexkit extension.
 */
export function getExtensionVersion(): string | null {
  return getExtension()?.packageJSON.version || null;
}

/**
 * Best-effort resolution of the Nexkit extension id.
 */
export function getExtensionId(): string | undefined {
  return getExtension()?.id;
}
