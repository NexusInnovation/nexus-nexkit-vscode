/**
 * Service for managing the AI credit usage status bar item
 */

import * as vscode from "vscode";
import { AiCreditUsageService } from "./aiCreditUsageService";
import { BillingUsageState } from "../models/billingUsage";
import { LoggingService } from "../../../shared/services/loggingService";
import { Commands } from "../../../shared/constants/commands";

/**
 * Service for displaying AI credit usage in the status bar
 */
export class AiCreditStatusBarService {
  private statusBarItem: vscode.StatusBarItem;
  private logging = LoggingService.getInstance();

  constructor(
    context: vscode.ExtensionContext,
    private usageService: AiCreditUsageService
  ) {
    // Create status bar item to the left of the update status (priority 99 < 100)
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);

    // Register for disposal
    context.subscriptions.push(this.statusBarItem);
  }

  /**
   * Initialize and show the status bar item
   */
  public async initialize(): Promise<void> {
    this.logging.debug("Initializing AiCreditStatusBarService");

    // Update status bar with current state
    this.updateStatusBar();

    // Listen for state changes and update display
    const updateInterval = setInterval(() => {
      this.updateStatusBar();
    }, 5000); // Update display every 5 seconds

    // Store interval for cleanup
    (this as any).updateInterval = updateInterval;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if ((this as any).updateInterval) {
      clearInterval((this as any).updateInterval);
    }
    this.statusBarItem.dispose();
  }

  // ===== Private Methods =====

  /**
   * Update status bar display based on current state
   */
  private updateStatusBar(): void {
    const state = this.usageService.getState();

    switch (state.status) {
      case "available":
        if (state.usage) {
          this.showAvailable(state);
        }
        break;

      case "stale":
        this.showStale(state);
        break;

      case "error":
        this.showError(state);
        break;

      case "unavailable":
      default:
        this.showUnavailable();
        break;
    }
  }

  /**
   * Display available usage data
   */
  private showAvailable(state: BillingUsageState): void {
    const usage = state.usage;
    if (!usage) {
      return;
    }

    // Format: $ 12.34 (for total USD)
    this.statusBarItem.text = `$(copilot) $${usage.totalUSD.toFixed(2)}`;
    this.statusBarItem.tooltip = this.createTooltip(usage, "Current Month Billing Data");
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.command = Commands.OPEN_AI_CREDIT_SETTINGS;
    this.statusBarItem.show();
  }

  /**
   * Display stale data (last known value but potentially outdated)
   */
  private showStale(state: BillingUsageState): void {
    if (state.usage) {
      this.statusBarItem.text = `$(copilot) $${state.usage.totalUSD.toFixed(2)} (stale)`;
      this.statusBarItem.tooltip = this.createTooltip(
        state.usage,
        "Stale Data - Last Update Failed"
      );
      this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      this.showUnavailable();
    }
    this.statusBarItem.command = Commands.OPEN_AI_CREDIT_SETTINGS;
    this.statusBarItem.show();
  }

  /**
   * Display error state
   */
  private showError(state: BillingUsageState): void {
    this.statusBarItem.text = `$(copilot) Error`;
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**AI Credit Billing Error**\n\n${state.error || "Unknown error"}\n\n[Click to configure billing token](command:${Commands.OPEN_AI_CREDIT_SETTINGS})`
    );
    this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    this.statusBarItem.command = Commands.OPEN_AI_CREDIT_SETTINGS;
    this.statusBarItem.show();
  }

  /**
   * Display unavailable state (no billing PAT configured)
   */
  private showUnavailable(): void {
    this.statusBarItem.text = `$(copilot) Not configured`;
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**AI Credit Usage Monitor**\n\nBilling token not configured. [Click to add token](command:${Commands.OPEN_AI_CREDIT_SETTINGS})`
    );
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.command = Commands.OPEN_AI_CREDIT_SETTINGS;
    // Don't show status bar if not configured to avoid clutter
    this.statusBarItem.hide();
  }

  /**
   * Create a detailed tooltip with billing information
   */
  private createTooltip(usage: any, title: string): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;

    tooltip.appendMarkdown(`**${title}**\n\n`);
    tooltip.appendMarkdown(`**Included Credits:**\n`);
    tooltip.appendMarkdown(`- Credits: ${usage.includedCredits}\n`);
    tooltip.appendMarkdown(`- USD: $${usage.includedUSD.toFixed(2)}\n\n`);

    tooltip.appendMarkdown(`**Additional Credits:**\n`);
    tooltip.appendMarkdown(`- Credits: ${usage.additionalCredits}\n`);
    tooltip.appendMarkdown(`- USD: $${usage.additionalUSD.toFixed(2)}\n\n`);

    tooltip.appendMarkdown(`**Total:**\n`);
    tooltip.appendMarkdown(`- Credits: ${usage.totalCredits}\n`);
    tooltip.appendMarkdown(`- USD: $${usage.totalUSD.toFixed(2)}\n\n`);

    tooltip.appendMarkdown(`**Period:** ${usage.period}\n`);

    const now = new Date();
    const fetchedAgo = this.getTimeDifference(usage.fetchedAt, now);
    tooltip.appendMarkdown(`**Last Updated:** ${fetchedAgo} ago\n\n`);

    tooltip.appendMarkdown(
      `[Configure billing token](command:${Commands.OPEN_AI_CREDIT_SETTINGS}) | [Refresh now](command:nexkit.refreshAiCreditUsage)`
    );

    return tooltip;
  }

  /**
   * Get human-readable time difference
   */
  private getTimeDifference(from: Date, to: Date): string {
    const seconds = Math.floor((to.getTime() - from.getTime()) / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m`;
    }
    if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)}h`;
    }
    return `${Math.floor(seconds / 86400)}d`;
  }
}
