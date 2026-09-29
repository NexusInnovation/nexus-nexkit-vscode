/**
 * Ceremony quick actions (SQD-047 / #262, PRD FR-055).
 *
 * Lists ceremonies from `.squad/ceremonies.md` (through the read-only
 * {@link SquadFileService}), launches one on demand by opening Copilot Chat on
 * the Squad coordinator agent with a ceremony prompt, and opens the ceremonies
 * file for editing. Launch requests are resolved against a fresh read of the
 * file — the webview only sends a ceremony id — so disabled or deleted
 * ceremonies can never be run from stale panel state. Every failure is a
 * structured, actionable {@link SquadError}.
 */

import * as vscode from "vscode";
import {
  SQUAD_CEREMONIES_RELATIVE_PATH,
  SquadCeremoniesDocument,
  SquadCeremony,
  SquadResult,
  isSquadErr,
  squadErr,
  squadOk,
} from "../models";
import { buildSquadCeremonyPrompt } from "./squadCeremonyParser";
import type { SquadFileService } from "./squadFileService";

/** Chat agent (custom agent `name`) defined by `.github/agents/squad.agent.md`. */
export const SQUAD_CHAT_AGENT_MODE = "Squad";

/** VS Code command that opens the Chat view with a query. */
export const CHAT_OPEN_COMMAND = "workbench.action.chat.open";

/** Command executor (defaults to `vscode.commands.executeCommand`). */
export type SquadCommandExecutor = (command: string, ...args: unknown[]) => Thenable<unknown>;

export class SquadCeremonyService {
  constructor(
    private readonly _workspaceRoot: vscode.Uri | undefined,
    private readonly _fileService: SquadFileService | undefined,
    private readonly _executeCommand: SquadCommandExecutor = (command, ...args) =>
      vscode.commands.executeCommand(command, ...args)
  ) {}

  /** Read and parse the workspace ceremonies. */
  public async listCeremonies(): Promise<SquadResult<SquadCeremoniesDocument>> {
    if (!this._fileService) {
      return squadErr(this._noWorkspaceError());
    }
    return this._fileService.readCeremonies();
  }

  /**
   * Launch a ceremony by id: re-read the file, reject unknown or disabled
   * ceremonies, then open Chat on the Squad agent with the ceremony prompt.
   */
  public async runCeremony(ceremonyId: string): Promise<SquadResult<SquadCeremony>> {
    if (typeof ceremonyId !== "string" || ceremonyId.trim().length === 0) {
      return squadErr({
        code: "invalid-input",
        message: "No ceremony was selected.",
        remediation: "Pick a ceremony in the Squad panel and try again.",
      });
    }

    const document = await this.listCeremonies();
    if (isSquadErr(document)) {
      return document;
    }
    if (!document.value.exists) {
      return squadErr({
        code: "file-read-failed",
        message: `No ${SQUAD_CEREMONIES_RELATIVE_PATH} was found in this workspace.`,
        remediation: `Add ${SQUAD_CEREMONIES_RELATIVE_PATH} (e.g. by running "squad init" or "squad upgrade") and refresh the ceremonies.`,
      });
    }

    const ceremony = document.value.ceremonies.find((candidate) => candidate.id === ceremonyId);
    if (!ceremony) {
      return squadErr({
        code: "invalid-input",
        message: "This ceremony is no longer defined in .squad/ceremonies.md.",
        remediation: "Refresh the ceremonies list and pick an existing ceremony.",
        detail: ceremonyId,
      });
    }
    if (!ceremony.enabled) {
      return squadErr({
        code: "invalid-input",
        message: `The "${ceremony.name}" ceremony is disabled.`,
        remediation: `Set its Enabled field to "✅ yes" in ${SQUAD_CEREMONIES_RELATIVE_PATH} to run it from NexKit.`,
      });
    }

    try {
      await this._executeCommand(CHAT_OPEN_COMMAND, {
        query: buildSquadCeremonyPrompt(ceremony),
        mode: SQUAD_CHAT_AGENT_MODE,
      });
    } catch (error) {
      return squadErr({
        code: "ceremony-failed",
        message: `Could not start the "${ceremony.name}" ceremony in Copilot Chat.`,
        remediation:
          "Make sure GitHub Copilot Chat is installed and signed in, and that .github/agents/squad.agent.md exists, then try again.",
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }

    return squadOk(ceremony);
  }

  /** Open `.squad/ceremonies.md` in an editor. */
  public async openCeremoniesFile(): Promise<SquadResult<void>> {
    if (!this._workspaceRoot) {
      return squadErr(this._noWorkspaceError());
    }
    const uri = vscode.Uri.joinPath(this._workspaceRoot, ...SQUAD_CEREMONIES_RELATIVE_PATH.split("/"));
    try {
      await this._executeCommand("vscode.open", uri);
      return squadOk(undefined);
    } catch (error) {
      return squadErr({
        code: "file-read-failed",
        message: `Could not open ${SQUAD_CEREMONIES_RELATIVE_PATH}.`,
        remediation: `Confirm ${SQUAD_CEREMONIES_RELATIVE_PATH} exists, then try again.`,
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }
  }

  private _noWorkspaceError() {
    return {
      code: "not-a-workspace" as const,
      message: "Squad ceremonies need an open workspace folder.",
      remediation: "Open the repository containing .squad/, then try again.",
    };
  }
}
