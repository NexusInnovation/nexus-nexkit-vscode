import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { fileExists } from "../../shared/utils/fileHelper";
import { REQUIREMENTS_FILE_NAME } from "./scriptResolver";
import { IPrerequisiteLogger } from "./types";

/** Scripts bundled in the extension VSIX under out/prerequisite-scripts/. */
const WINDOWS_SCRIPTS = ["Check-Validation.ps1", "Validate-Prerequisites.ps1", "Setup-Environment.ps1"] as const;
const POSIX_SCRIPTS = ["check-validation.sh", "validate-prerequisites.sh", "setup-environment.sh"] as const;

/**
 * Copies the prerequisite scripts bundled in the extension VSIX into the target
 * workspace's scripts directory. Non-destructive: existing files are never overwritten,
 * so projects that maintain their own scripts are not affected.
 */
export class PrerequisiteScriptsDeployer {
  public constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _logging: IPrerequisiteLogger
  ) {}

  /**
   * Deploys scripts only when `requirements.json` exists at the workspace root,
   * making the call safe to issue at every activation.
   */
  public async deployIfConfigured(workspaceRoot: string, scriptsPath: string): Promise<void> {
    const configPath = path.join(workspaceRoot, REQUIREMENTS_FILE_NAME);
    if (!(await fileExists(configPath))) {
      return;
    }
    await this.deployScripts(workspaceRoot, scriptsPath);
  }

  /**
   * Iterates every open workspace folder and deploys scripts where
   * `requirements.json` is present. Safe to call at every activation.
   */
  public async deployForActiveWorkspace(): Promise<void> {
    const scriptsPath = SettingsManager.getPrerequisitesScriptsPath();
    const roots: string[] = [];

    const workspaceFile = vscode.workspace.workspaceFile;
    if (workspaceFile?.scheme === "file") {
      roots.push(path.dirname(workspaceFile.fsPath));
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme === "file" && !roots.includes(folder.uri.fsPath)) {
        roots.push(folder.uri.fsPath);
      }
    }

    for (const root of roots) {
      await this.deployIfConfigured(root, scriptsPath);
    }
  }

  /** Unconditionally ensures all platform scripts are present in the scripts directory. */
  public async deployScripts(workspaceRoot: string, scriptsPath: string): Promise<void> {
    const bundledDir = vscode.Uri.joinPath(this._extensionUri, "out", "prerequisite-scripts");
    const targetDir = path.join(workspaceRoot, scriptsPath);

    const scripts = process.platform === "win32" ? WINDOWS_SCRIPTS : POSIX_SCRIPTS;

    for (const name of scripts) {
      const target = path.join(targetDir, name);
      if (await fileExists(target)) {
        continue;
      }

      const source = vscode.Uri.joinPath(bundledDir, name).fsPath;
      if (!(await fileExists(source))) {
        this._logging.warn(`Prerequisites: bundled script not found in extension: ${name}`);
        continue;
      }

      await fs.promises.mkdir(targetDir, { recursive: true });
      await fs.promises.copyFile(source, target);
      if (process.platform !== "win32") {
        await fs.promises.chmod(target, 0o755);
      }
      this._logging.info(`Prerequisites: deployed ${name} → ${targetDir}`);
    }
  }
}
