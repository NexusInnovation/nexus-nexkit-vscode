import * as vscode from "vscode";

export const EXTENSION_ID = "nexusinno.nexus-nexkit-vscode";

export function getExtension() {
  return vscode.extensions.getExtension(EXTENSION_ID);
}

export function getExtensionVersion(): string {
  const extension = getExtension();
  return extension?.packageJSON.version || "Unknown";
}
