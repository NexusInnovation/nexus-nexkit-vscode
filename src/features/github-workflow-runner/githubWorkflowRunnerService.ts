import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

/**
 * Install commands for act, ordered by preference
 */
const INSTALL_OPTIONS: { label: string; command: string; check: string }[] = [
  {
    label: "winget",
    command: "winget install nektos.act --accept-package-agreements --accept-source-agreements",
    check: "winget",
  },
  { label: "chocolatey", command: "choco install act-cli -y", check: "choco" },
  { label: "scoop", command: "scoop install act", check: "scoop" },
];

/**
 * Known installation directories for act on Windows, resolved at runtime.
 * Each entry is a function returning the candidate path (env vars may be undefined).
 */
const WINDOWS_ACT_CANDIDATES: (() => string | undefined)[] = [
  // winget
  () => {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      return undefined;
    }
    const packagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    try {
      const entries = fs.readdirSync(packagesDir);
      const actDir = entries.find((e) => e.startsWith("nektos.act"));
      if (actDir) {
        return path.join(packagesDir, actDir, "act.exe");
      }
    } catch {
      // not installed via winget
    }
    return undefined;
  },
  // chocolatey
  () => {
    const chocoInstall = process.env.ChocolateyInstall || "C:\\ProgramData\\chocolatey";
    return path.join(chocoInstall, "bin", "act.exe");
  },
  // scoop
  () => {
    const userProfile = process.env.USERPROFILE;
    if (!userProfile) {
      return undefined;
    }
    return path.join(userProfile, "scoop", "shims", "act.exe");
  },
];

/**
 * Represents a GitHub Actions workflow file found in the workspace
 */
export interface WorkflowInfo {
  /** Display name extracted from the workflow YAML (or filename fallback) */
  name: string;
  /** Relative path from workspace root (e.g., .github/workflows/ci.yml) */
  relativePath: string;
  /** Absolute path to the workflow file */
  absolutePath: string;
}

/**
 * Parameters for running a workflow locally via act
 */
export interface RunWorkflowParams {
  /** Relative path to the workflow file */
  workflowFile: string;
  /** Optional job name to run */
  job?: string;
  /** GitHub event type to simulate */
  event: string;
  /** Whether to perform a dry run */
  dryRun: boolean;
  /** Whether to just list jobs */
  list: boolean;
}

/**
 * Default platform mapping for act
 */
const DEFAULT_PLATFORM = "ubuntu-latest=catthehacker/ubuntu:act-latest";

/**
 * Service for discovering and running GitHub Actions workflows locally using act.
 *
 * Invokes `act` (nektos/act) directly in a VS Code terminal — no external
 * scripts are required. The extension ships the full runner logic.
 */
export class GitHubWorkflowRunnerService {
  private _actPath: string | undefined;

  /**
   * Discovers all workflow YAML files in the .github/workflows/ directory of the workspace
   */
  public async listWorkflows(): Promise<WorkflowInfo[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const rootUri = workspaceFolders[0].uri;
    const workflowsDir = vscode.Uri.joinPath(rootUri, ".github", "workflows");

    try {
      const entries = await vscode.workspace.fs.readDirectory(workflowsDir);
      const workflows: WorkflowInfo[] = [];

      for (const [fileName, fileType] of entries) {
        if (fileType !== vscode.FileType.File) {
          continue;
        }
        if (!fileName.endsWith(".yml") && !fileName.endsWith(".yaml")) {
          continue;
        }

        const fileUri = vscode.Uri.joinPath(workflowsDir, fileName);
        const relativePath = path.posix.join(".github", "workflows", fileName);
        const name = await this.extractWorkflowName(fileUri, fileName);

        workflows.push({
          name,
          relativePath,
          absolutePath: fileUri.fsPath,
        });
      }

      return workflows.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      // Directory doesn't exist or is not readable
      return [];
    }
  }

  /**
   * Runs a workflow locally by invoking `act` directly in a VS Code terminal.
   *
   * If Docker is not installed or not running, shows an error message.
   * If `act` is not installed, prompts the user to install it automatically
   * via winget, chocolatey, or scoop.
   */
  public async runWorkflow(params: RunWorkflowParams): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }

    // Check if Docker is installed and running
    if (!this.isDockerInstalled()) {
      const action = await vscode.window.showErrorMessage(
        "Docker is required to run GitHub workflows locally but was not found. Please install Docker Desktop and try again.",
        "Open Docker Install Page"
      );
      if (action === "Open Docker Install Page") {
        try {
          await vscode.env.openExternal(vscode.Uri.parse("https://www.docker.com/products/docker-desktop/"));
        } catch (err) {
          void vscode.window.showErrorMessage(
            "Failed to open Docker install page. Please open it manually: https://www.docker.com/products/docker-desktop/"
          );
        }
      }
      return;
    }

    if (!this.isDockerRunning()) {
      vscode.window.showErrorMessage("Docker is installed but not running. Please start Docker Desktop and try again.");
      return;
    }

    // Check if act is available; prompt to install if not
    const actPath = this.findActPath();
    if (!actPath) {
      const willInstall = await this.promptInstallAct();
      if (!willInstall) {
        return;
      }
      // User was sent to a terminal to install — they need to re-run after it completes
      return;
    }

    const rootUri = workspaceFolders[0].uri;
    const rootPath = rootUri.fsPath;
    const workflowAbsolutePath = vscode.Uri.joinPath(rootUri, params.workflowFile).fsPath;

    const actArgs = this.buildActArgs(params, workflowAbsolutePath, rootPath);
    const command = `& "${actPath}" ${actArgs.join(" ")}; Write-Host ""; Read-Host "Press Enter to close"; exit`;

    const terminal = vscode.window.createTerminal({
      name: "GitHub Workflow Runner",
      cwd: rootPath,
    });
    terminal.show();
    terminal.sendText(command);
  }

  /**
   * Checks whether `act` is installed on the system.
   */
  public isActInstalled(): boolean {
    return this.findActPath() !== undefined;
  }

  /**
   * Checks whether Docker is installed on the system.
   */
  public isDockerInstalled(): boolean {
    return this.resolveFromPath("docker") !== undefined;
  }

  /**
   * Checks whether the Docker daemon is currently running.
   */
  public isDockerRunning(): boolean {
    try {
      execSync("docker info", { encoding: "utf-8", timeout: 10000, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves the full path to the `act` executable.
   * Searches in order:
   *   1. Cached path from a previous successful lookup
   *   2. System PATH via `where`/`which`
   *   3. Known installation directories (winget, chocolatey, scoop)
   *
   * Caches the result so subsequent calls are fast.
   */
  public findActPath(): string | undefined {
    // Return cached path if still valid
    if (this._actPath && fs.existsSync(this._actPath)) {
      return this._actPath;
    }
    this._actPath = undefined;

    // 1. Try system PATH (may work if VS Code was launched after installation)
    const pathResult = this.resolveFromPath("act");
    if (pathResult) {
      this._actPath = pathResult;
      return pathResult;
    }

    // 2. On Windows, try refreshed PATH from registry
    if (process.platform === "win32") {
      const refreshedResult = this.resolveFromRefreshedPath();
      if (refreshedResult) {
        this._actPath = refreshedResult;
        return refreshedResult;
      }

      // 3. Probe known installation directories
      for (const candidate of WINDOWS_ACT_CANDIDATES) {
        const candidatePath = candidate();
        if (candidatePath && fs.existsSync(candidatePath)) {
          this._actPath = candidatePath;
          return candidatePath;
        }
      }
    }

    return undefined;
  }

  /**
   * Uses `where` (Windows) or `which` (Unix) to resolve the full path of a command.
   */
  private resolveFromPath(command: string): string | undefined {
    try {
      const checkCmd = process.platform === "win32" ? "where" : "which";
      const result = execSync(`${checkCmd} ${command}`, { encoding: "utf-8", timeout: 5000 }).trim();
      // `where` may return multiple lines; take the first one
      const firstLine = result.split(/\r?\n/)[0]?.trim();
      if (firstLine && fs.existsSync(firstLine)) {
        return firstLine;
      }
    } catch {
      // command not on PATH
    }
    return undefined;
  }

  /**
   * On Windows, refreshes PATH from the registry and resolves `act` in a
   * single PowerShell invocation. Returns the full path or undefined.
   */
  private resolveFromRefreshedPath(): string | undefined {
    try {
      const result = execSync(
        '$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User"); (Get-Command act -ErrorAction Stop).Source',
        { shell: "powershell.exe", encoding: "utf-8", timeout: 15000 }
      ).trim();
      if (result && fs.existsSync(result)) {
        return result;
      }
    } catch {
      // act not found even with refreshed PATH
    }
    return undefined;
  }

  /**
   * Prompts the user to install `act` via an available package manager.
   * Returns true if an install command was sent to a terminal.
   */
  private async promptInstallAct(): Promise<boolean> {
    const availableManagers = this.detectPackageManagers();

    if (availableManagers.length === 0) {
      const result = await vscode.window.showErrorMessage(
        "act (nektos/act) is required but not installed, and no supported package manager was found (winget, choco, scoop).",
        "Open Install Guide"
      );
      if (result === "Open Install Guide") {
        vscode.env.openExternal(vscode.Uri.parse("https://nektosact.com/installation/"));
      }
      return false;
    }

    const items = availableManagers.map((m) => m.label);
    items.push("Install Manually");

    const choice = await vscode.window.showWarningMessage(
      "act (nektos/act) is required to run GitHub workflows locally but was not found. Install it now?",
      ...items
    );

    if (!choice || choice === "Install Manually") {
      if (choice === "Install Manually") {
        vscode.env.openExternal(vscode.Uri.parse("https://nektosact.com/installation/"));
      }
      return false;
    }

    const manager = availableManagers.find((m) => m.label === choice);
    if (!manager) {
      return false;
    }

    const terminal = vscode.window.createTerminal({ name: "Install act" });
    terminal.show();
    terminal.sendText(manager.command);

    vscode.window.showInformationMessage(
      `Installing act via ${manager.label}... After installation completes, try running your workflow again.`
    );
    return true;
  }

  /**
   * Detects which package managers are available on the system.
   */
  private detectPackageManagers(): { label: string; command: string }[] {
    const available: { label: string; command: string }[] = [];
    for (const option of INSTALL_OPTIONS) {
      if (this.resolveFromPath(option.check)) {
        available.push({ label: option.label, command: option.command });
      }
    }
    return available;
  }

  /**
   * Builds the act CLI arguments array from the given parameters.
   */
  public buildActArgs(params: RunWorkflowParams, workflowAbsolutePath: string, rootPath: string): string[] {
    const args: string[] = [];

    if (params.list) {
      // List mode: only show jobs, don't run anything
      args.push("--workflows", `"${workflowAbsolutePath}"`);
      args.push("--list");
      return args;
    }

    // Event type (positional argument for act)
    args.push(params.event);

    // Workflow file
    args.push("--workflows", `"${workflowAbsolutePath}"`);

    // Job filter
    if (params.job) {
      args.push("--job", `"${params.job}"`);
    }

    // Platform mapping
    args.push("--platform", DEFAULT_PLATFORM);

    // Auto-detect .secrets file in workspace root
    const secretsPath = path.join(rootPath, ".secrets");
    // Use vscode.Uri to build the path but check via workspace.fs would be async,
    // so we reference the path and let act handle a missing file gracefully.
    // act itself ignores --secret-file if the file doesn't exist.

    // Dry run
    if (params.dryRun) {
      args.push("--dryrun");
    }

    return args;
  }

  /**
   * Extracts the workflow name from the YAML `name:` field, falling back to the filename
   */
  private async extractWorkflowName(fileUri: vscode.Uri, fileName: string): Promise<string> {
    try {
      const content = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(content).toString("utf-8");
      // Simple regex to extract the top-level `name:` field
      const match = text.match(/^name:\s*(.+)$/m);
      if (match && match[1]) {
        return match[1].trim().replace(/^['"]|['"]$/g, "");
      }
    } catch {
      // Fall back to filename
    }
    return fileName.replace(/\.(yml|yaml)$/, "");
  }
}
