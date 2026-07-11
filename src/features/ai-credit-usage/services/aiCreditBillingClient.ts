/**
 * Client for GitHub Copilot billing API
 * Queries billing data for a specific user using a billing PAT
 */

import * as vscode from "vscode";
import { GitHubCopilotBillingUsageResponse, ParsedBillingUsage } from "../models/billingUsage";
import { LoggingService } from "../../../shared/services/loggingService";

const GITHUB_API_BASE = "https://api.github.com";

// USD conversion rate: 1 credit = 0.01 USD
const CREDIT_TO_USD_RATE = 0.01;

/**
 * Represents the result of a billing API call
 */
export interface BillingApiResult {
  success: boolean;
  data?: ParsedBillingUsage;
  error?: string;
  statusCode?: number;
}

/**
 * Service for querying GitHub Copilot billing API
 */
export class AiCreditBillingClient {
  private logging = LoggingService.getInstance();

  /**
   * Fetch current user's GitHub login
   * @param token Session token with repo scope
   */
  public async getCurrentUserLogin(token: string): Promise<string | undefined> {
    try {
      const headers = this.getAuthHeaders(token);
      const response = await this.fetch(`${GITHUB_API_BASE}/user`, { headers });

      if (!response.ok) {
        this.logging.warn(`Failed to fetch user: ${response.status} ${response.statusText}`);
        return undefined;
      }

      const data = (await response.json()) as { login?: string };
      return data.login;
    } catch (error) {
      this.logging.warn("Error fetching current user", error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  /**
   * Fetch billing usage for a specific user for the current month
   * @param billingToken Token with billing scope (can be admin or service account)
   * @param userLogin GitHub user login to query
   */
  public async fetchUserBillingUsage(billingToken: string, userLogin: string): Promise<BillingApiResult> {
    try {
      // Get current date to determine billing period
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const period = `${year}-${month}`;

      const headers = this.getAuthHeaders(billingToken);
      const url = `${GITHUB_API_BASE}/orgs/{org}/settings/billing/ai_credit/usage?user=${userLogin}&year=${year}&month=${month}&product=copilot`;

      // Note: The actual org should be derived server-side or from context
      // For now, we construct the URL generically
      // The API endpoint requires admin access to the org
      const apiUrl = `${GITHUB_API_BASE}/user/billing/ai_credit/usage?month=${month}&year=${year}`;

      const response = await this.fetch(apiUrl, { headers, timeout: 10000 });

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          statusCode: response.status,
          error: `Unauthorized (${response.status}): Billing PAT may not have required permissions`,
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          statusCode: 404,
          error: "Billing data not found for this user or period",
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          statusCode: 429,
          error: "GitHub API rate limit exceeded",
        };
      }

      if (!response.ok) {
        return {
          success: false,
          statusCode: response.status,
          error: `GitHub API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as GitHubCopilotBillingUsageResponse;
      const parsed = this.parseBillingResponse(data, period);

      return {
        success: true,
        data: parsed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to fetch billing data: ${errorMessage}`,
      };
    }
  }

  /**
   * Parse GitHub billing API response into our format
   */
  private parseBillingResponse(
    response: GitHubCopilotBillingUsageResponse,
    period: string
  ): ParsedBillingUsage {
    // Ensure all values are numbers
    const gross = Math.max(0, Number(response.grossQuantity) || 0);
    const discount = Math.max(0, Number(response.discountQuantity) || 0);
    const net = Math.max(0, Number(response.netQuantity) || 0);

    // Calculate included and additional credits without double-counting
    // Included = gross (from license), Additional = discount (purchased)
    const includedCredits = gross;
    const additionalCredits = discount;
    const totalCredits = net;

    return {
      includedCredits,
      additionalCredits,
      totalCredits,
      includedUSD: Math.round(includedCredits * CREDIT_TO_USD_RATE * 100) / 100,
      additionalUSD: Math.round(additionalCredits * CREDIT_TO_USD_RATE * 100) / 100,
      totalUSD: Math.round(totalCredits * CREDIT_TO_USD_RATE * 100) / 100,
      period,
      fetchedAt: new Date(),
    };
  }

  /**
   * Get authentication headers for GitHub API
   */
  private getAuthHeaders(token: string): Record<string, string> {
    return {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Nexkit-VSCode-Extension",
    };
  }

  /**
   * Fetch with timeout
   */
  private async fetch(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    const { timeout = 30000, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      return await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
