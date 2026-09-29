/**
 * Confirmation seam for Squad plugin write actions (SQD-039, FR-044).
 */

import * as vscode from "vscode";
import type { SquadPluginActionDescriptor } from "../models";

/** What the user is asked to confirm before a plugin write action runs. */
export interface SquadPluginActionConfirmationRequest {
  /** Descriptor of the action about to run. */
  descriptor: SquadPluginActionDescriptor;

  /** Resolved operand (marketplace source/name, plugin directory or id). */
  target: string;

  /** Exact `squad` argument vector that will run, for transparency. */
  commandPreview: string;
}

/** Presents the confirmation dialog. Injectable so tests never open UI. */
export interface SquadPluginActionConfirmer {
  /** Return `true` only when the user explicitly approved the action. */
  confirm(request: SquadPluginActionConfirmationRequest): Promise<boolean>;
}

/** Modal-dialog confirmation used in production. */
export class VscodeSquadPluginActionConfirmer implements SquadPluginActionConfirmer {
  public async confirm(request: SquadPluginActionConfirmationRequest): Promise<boolean> {
    const { descriptor, target, commandPreview } = request;
    const detail = [
      `Command: ${commandPreview}`,
      "• Your existing .squad/ files will be backed up first.",
      descriptor.destructive ? "• This removes Squad plugin data from this workspace." : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const title = target ? `${descriptor.label} "${target}"?` : `${descriptor.label}?`;
    const choice = await vscode.window.showWarningMessage(
      title,
      { modal: true, detail },
      descriptor.label
    );
    return choice === descriptor.label;
  }
}
