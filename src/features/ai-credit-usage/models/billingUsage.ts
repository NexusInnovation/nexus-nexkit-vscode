/**
 * Data models for GitHub Copilot billing usage
 */

/**
 * Response from GitHub Copilot billing API for a specific user
 */
export interface GitHubCopilotBillingUsageResponse {
  /**
   * Quantity of included AI credits (included in license)
   */
  grossQuantity: number;

  /**
   * Quantity of additional AI credits (purchased separately)
   */
  discountQuantity: number;

  /**
   * Net quantity (total consumed)
   */
  netQuantity: number;
}

/**
 * Parsed billing usage with USD conversion (1 credit = 0.01 USD)
 */
export interface ParsedBillingUsage {
  /**
   * Included credits (from license)
   */
  includedCredits: number;

  /**
   * Additional credits (purchased)
   */
  additionalCredits: number;

  /**
   * Total credits consumed
   */
  totalCredits: number;

  /**
   * Included credits in USD
   */
  includedUSD: number;

  /**
   * Additional credits in USD
   */
  additionalUSD: number;

  /**
   * Total consumed in USD
   */
  totalUSD: number;

  /**
   * Billing period (YYYY-MM format)
   */
  period: string;

  /**
   * When this data was fetched
   */
  fetchedAt: Date;
}

/**
 * Status of AI credit usage data
 */
export type BillingUsageStatus = "available" | "stale" | "unavailable" | "error";

/**
 * Billing usage state for display
 */
export interface BillingUsageState {
  /**
   * Current status
   */
  status: BillingUsageStatus;

  /**
   * Parsed usage data (if available)
   */
  usage?: ParsedBillingUsage;

  /**
   * Error message (if status is 'error')
   */
  error?: string;

  /**
   * Whether auto-refresh is currently disabled due to auth errors
   */
  autoRefreshDisabled: boolean;
}
