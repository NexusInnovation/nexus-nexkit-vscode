import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Check if file or directory exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get workspace root path.
 *
 * When a multi-root `.code-workspace` file is open, the "workspace root" is
 * the directory that contains the `.code-workspace` file — not the first
 * folder listed inside it. `.nexkit/` and other workspace-level artefacts
 * must always land here so that they are adjacent to the workspace file and
 * at the true root of the project.
 *
 * For a plain single-folder workspace (no `.code-workspace` file) the first
 * workspace folder is, by definition, the workspace root.
 */
export function getWorkspaceRoot(): string {
  const workspaceFile = vscode.workspace.workspaceFile;
  if (workspaceFile && workspaceFile.scheme === "file") {
    return path.dirname(workspaceFile.fsPath);
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("No workspace folder open");
  }
  return workspaceFolder.uri.fsPath;
}

/**
 * Copy directory recursively
 */
export async function copyDirectory(source: string, target: string): Promise<void> {
  const stats = await fs.promises.stat(source);

  if (stats.isDirectory()) {
    await fs.promises.mkdir(target, { recursive: true });
    const entries = await fs.promises.readdir(source);

    for (const entry of entries) {
      const sourcePath = path.join(source, entry);
      const targetPath = path.join(target, entry);
      await copyDirectory(sourcePath, targetPath);
    }
  } else {
    await fs.promises.copyFile(source, target);
  }
}

/**
 * Deep merge two objects, with target values taking priority
 * @param source - Base object (template settings)
 * @param target - Override object (user settings) - these values win
 * @returns Merged object
 */
export function deepMerge(source: any, target: any): any {
  const result: any = { ...source };
  for (const key in target) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      if (target[key] && typeof target[key] === "object" && !Array.isArray(target[key]) && !Array.isArray(source[key])) {
        result[key] = deepMerge(source[key] ?? {}, target[key]);
      } else {
        // Primitive, array, or only one side is object - target wins
        result[key] = target[key];
      }
    }
  }
  return result;
}
