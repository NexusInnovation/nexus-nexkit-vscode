/**
 * Commands for AI Credit usage features
 */

import * as vscode from "vscode";
import { ServiceContainer } from "../../core/serviceContainer";
import { Commands } from "../../shared/constants/commands";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Register AI credit commands
 */
export function registerAiCreditCommands(context: vscode.ExtensionContext, services: ServiceContainer): void {
  const logging = LoggingService.getInstance();

  // Open AI credit settings/configuration
  const openSettingsCommand = vscode.commands.registerCommand(Commands.OPEN_AI_CREDIT_SETTINGS, async () => {
    try {
      await openAiCreditSettingsDialog(context, services);
    } catch (error) {
      logging.error("Error opening AI credit settings", error);
      vscode.window.showErrorMessage("Failed to open AI credit settings");
    }
  });

  // Refresh AI credit usage
  const refreshCommand = vscode.commands.registerCommand(Commands.REFRESH_AI_CREDIT_USAGE, async () => {
    try {
      await services.aiCreditUsage.refreshUsage();
      vscode.window.showInformationMessage("AI credit usage refreshed");
    } catch (error) {
      logging.error("Error refreshing AI credit usage", error);
      vscode.window.showErrorMessage("Failed to refresh AI credit usage");
    }
  });

  context.subscriptions.push(openSettingsCommand, refreshCommand);
}

/**
 * Open the AI credit settings dialog
 */
async function openAiCreditSettingsDialog(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): Promise<void> {
  const logging = LoggingService.getInstance();

  const choices = ["Add/Update Billing Token", "Remove Billing Token", "Refresh Usage", "Cancel"];
  const selection = await vscode.window.showQuickPick(choices, {
    placeHolder: "AI Credit Usage Configuration",
  });

  if (!selection || selection === "Cancel") {
    return;
  }

  switch (selection) {
    case "Add/Update Billing Token":
      await addOrUpdateBillingToken(context, services);
      break;

    case "Remove Billing Token":
      await removeBillingToken(context, services);
      break;

    case "Refresh Usage":
      await services.aiCreditUsage.refreshUsage();
      vscode.window.showInformationMessage("AI credit usage refreshed");
      break;
  }
}

/**
 * Prompt user to add or update billing token
 */
async function addOrUpdateBillingToken(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): Promise<void> {
  const logging = LoggingService.getInstance();

  const token = await vscode.window.showInputBox({
    title: "GitHub Billing PAT",
    prompt: "Enter your GitHub Personal Access Token with billing scope",
    password: true,
    ignoreFocusOut: true,
    placeHolder: "ghp_...",
  });

  if (!token) {
    return;
  }

  try {
    // Store token in secure storage
    await context.secrets.store("nexkit.aiCredit.billingPat", token);
    logging.info("Billing PAT stored successfully");

    // Refresh usage with new token
    await services.aiCreditUsage.refreshUsage();
    vscode.window.showInformationMessage("Billing token stored and usage refreshed");
  } catch (error) {
    logging.error("Error storing billing token", error);
    vscode.window.showErrorMessage("Failed to store billing token");
  }
}

/**
 * Prompt user to remove billing token
 */
async function removeBillingToken(
  context: vscode.ExtensionContext,
  services: ServiceContainer
): Promise<void> {
  const logging = LoggingService.getInstance();

  const confirmation = await vscode.window.showWarningMessage(
    "Remove billing token for AI credit monitoring?",
    { modal: true },
    "Remove"
  );

  if (confirmation === "Remove") {
    try {
      await context.secrets.delete("nexkit.aiCredit.billingPat");
      logging.info("Billing PAT removed");
      vscode.window.showInformationMessage("Billing token removed");
    } catch (error) {
      logging.error("Error removing billing token", error);
      vscode.window.showErrorMessage("Failed to remove billing token");
    }
  }
}
