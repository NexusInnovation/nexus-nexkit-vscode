/**
 * Service for managing AI credit usage polling and state
 * Handles refresh intervals, caching, and error states
 */

import * as vscode from "vscode";
import { AiCreditBillingClient } from "./aiCreditBillingClient";
import { BillingUsageState } from "../models/billingUsage";
import { LoggingService } from "../../../shared/services/loggingService";
import { SettingsManager } from "../../../core/settingsManager";

// Minimum interval between refreshes (seconds)
const MIN_REFRESH_INTERVAL_MS = 60 * 1000; // 60 seconds

// Default polling interval when window is active (seconds)
const DEFAULT_POLLING_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Service for polling and caching AI credit usage
 */
export class AiCreditUsageService implements vscode.Disposable {
  private billingClient = new AiCreditBillingClient();
  private logging = LoggingService.getInstance();

  private state: BillingUsageState = {
    status: "unavailable",
    autoRefreshDisabled: false,
  };

  private lastRefreshTime: number = 0;
  private pollingTimer: NodeJS.Timeout | undefined;
  private refreshInProgress: boolean = false;

  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize the service
   */
  public async initialize(): Promise<void> {
    this.logging.debug("Initializing AiCreditUsageService");

    // Check if billing PAT is configured
    if (!(await this.isBillingPatConfigured())) {
      this.logging.debug("Billing PAT not configured");
      this.state.status = "unavailable";
      return;
    }

    // Initial refresh on activation
    await this.refreshUsage();

    // Start polling when window is focused
    if (vscode.window.state.focused) {
      this.startPolling();
    }
  }

  /**
   * Manually refresh usage data
   */
  public async refreshUsage(): Promise<void> {
    // Skip if already refreshing or too soon after last refresh
    if (this.refreshInProgress) {
      return;
    }

    const now = Date.now();
    if (now - this.lastRefreshTime < MIN_REFRESH_INTERVAL_MS) {
      this.logging.debug("Refresh skipped (too soon)", {
        timeSinceLastRefresh: now - this.lastRefreshTime,
      });
      return;
    }

    this.refreshInProgress = true;
    this.lastRefreshTime = now;

    try {
      // Check if billing PAT is configured
      if (!(await this.isBillingPatConfigured())) {
        this.state.status = "unavailable";
        this.state.autoRefreshDisabled = true;
        this.refreshInProgress = false;
        return;
      }

      // Get current user from VS Code GitHub session
      const userLogin = await this.getCurrentUserLogin();
      if (!userLogin) {
        this.state.status = "unavailable";
        this.state.error = "Could not determine GitHub user";
        this.refreshInProgress = false;
        return;
      }

      // Fetch billing data
      const billingToken = await this.getBillingPat();
      if (!billingToken) {
        this.state.status = "unavailable";
        this.state.error = "Billing PAT not found";
        this.refreshInProgress = false;
        return;
      }

      const result = await this.billingClient.fetchUserBillingUsage(billingToken, userLogin);

      if (result.success && result.data) {
        this.state.status = "available";
        this.state.usage = result.data;
        this.state.error = undefined;
        this.state.autoRefreshDisabled = false;
        this.logging.debug("Billing usage updated successfully", {
          totalUSD: result.data.totalUSD,
        });
      } else {
        // Handle auth errors specially
        if (result.statusCode === 401 || result.statusCode === 403) {
          this.state.status = "error";
          this.state.error = result.error;
          this.state.autoRefreshDisabled = true;
          this.stopPolling();
          this.logging.warn("Billing API auth failed, disabling auto-refresh", {
            statusCode: result.statusCode,
          });
        } else {
          this.state.status = "stale";
          this.state.error = result.error;
          this.logging.warn("Billing usage refresh failed", { error: result.error });
        }
      }
    } catch (error) {
      this.state.status = "stale";
      this.state.error = error instanceof Error ? error.message : String(error);
      this.logging.error("Error refreshing billing usage", error);
    } finally {
      this.refreshInProgress = false;
    }
  }

  /**
   * Get current billing state
   */
  public getState(): BillingUsageState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  public onStateChange(callback: (state: BillingUsageState) => void): vscode.Disposable {
    // This is a simple implementation; could be enhanced with EventEmitter
    const disposable = vscode.Disposable.from();
    return disposable;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.stopPolling();
    this.disposables.forEach((d) => d.dispose());
  }

  // ===== Private Methods =====

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for window focus changes
    const focusListener = vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });
    this.disposables.push(focusListener);

    // Listen for configuration changes
    const configListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("nexkit.aiCredit")) {
        // Reset state and refresh if configuration changed
        this.state.autoRefreshDisabled = false;
        await this.refreshUsage();
      }
    });
    this.disposables.push(configListener);
  }

  /**
   * Start polling for updates when window is focused
   */
  private startPolling(): void {
    if (this.pollingTimer || this.state.autoRefreshDisabled) {
      return;
    }

    this.logging.debug("Starting AI credit usage polling");
    this.pollingTimer = setInterval(async () => {
      await this.refreshUsage();
    }, DEFAULT_POLLING_INTERVAL_MS);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
      this.logging.debug("Stopped AI credit usage polling");
    }
  }

  /**
   * Check if billing PAT is configured
   */
  private async isBillingPatConfigured(): Promise<boolean> {
    const pat = await this.getBillingPat();
    return !!pat;
  }

  /**
   * Get billing PAT from secure storage
   */
  private async getBillingPat(): Promise<string | undefined> {
    try {
      return await this.context.secrets.get("nexkit.aiCredit.billingPat");
    } catch (error) {
      this.logging.error("Error reading billing PAT from storage", error);
      return undefined;
    }
  }

  /**
   * Get current GitHub user login
   */
  private async getCurrentUserLogin(): Promise<string | undefined> {
    try {
      const session = await vscode.authentication.getSession("github", ["repo"], { createIfNone: false });
      if (!session) {
        return undefined;
      }

      return await this.billingClient.getCurrentUserLogin(session.accessToken);
    } catch (error) {
      this.logging.warn("Error getting current user", error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }
}
