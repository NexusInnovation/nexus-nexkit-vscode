/**
 * Represents a configured Azure DevOps connection
 */
export interface DevOpsConnection {
  /**
   * Unique identifier for this connection (format: {org}-{project})
   */
  id: string;

  /**
   * Azure DevOps organization name
   */
  organization: string;

  /**
   * Azure DevOps project name
   */
  project: string;

  /**
   * Whether this is the currently active connection
   */
  isActive: boolean;

  /**
   * The MCP server name in the config (format: azure-devops-{org}-{project})
   */
  serverName: string;
}

/**
 * Result of parsing a DevOps URL
 */
export interface DevOpsUrlParseResult {
  /**
   * Whether the URL was successfully parsed
   */
  isValid: boolean;

  /**
   * Extracted organization name
   */
  organization?: string;

  /**
   * Extracted project name
   */
  project?: string;

  /**
   * Error message if parsing failed
   */
  error?: string;
}

/**
 * MCP domains enabled for Azure DevOps connections
 * Fixed set as per requirements
 */
export const AZURE_DEVOPS_MCP_DOMAINS = ["core", "work", "work-items", "search"] as const;
