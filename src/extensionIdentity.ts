import * as vscode from "vscode";

export const NEXKIT_EXTENSION_NAME = "nexus-nexkit-vscode";

/**
 * Find the Nexkit extension instance from the current VS Code extension host.
 * This avoids hard-coding publisher IDs which can vary between dev/test vs marketplace.
 */
export function findNexkitExtension(): vscode.Extension<any> | undefined {
  return vscode.extensions.all.find(
    (ext) => ext.packageJSON?.name === NEXKIT_EXTENSION_NAME
  );
}

/**
 * Best-effort resolution of the Nexkit extension id.
 */
export function getNexkitExtensionId(): string | undefined {
  return findNexkitExtension()?.id;
}

export function getNexkitExtensionVersion(): string {
  return findNexkitExtension()?.packageJSON?.version || "unknown";
}
