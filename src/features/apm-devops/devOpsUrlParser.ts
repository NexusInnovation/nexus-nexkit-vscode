import { DevOpsUrlParseResult } from "./models/devOpsConnection";

/**
 * Parse an Azure DevOps URL to extract organization and project
 *
 * Supported formats:
 * - https://dev.azure.com/{organization}/{project}
 * - https://dev.azure.com/{organization}/{project}/_workitems
 * - https://dev.azure.com/{organization}/{project}/_git/...
 * - https://{organization}.visualstudio.com/{project}
 * - https://{organization}.visualstudio.com/DefaultCollection/{project}
 *
 * @param url The Azure DevOps URL to parse
 * @returns Parse result with organization, project, or error
 */
export function parseDevOpsUrl(url: string): DevOpsUrlParseResult {
  if (!url || typeof url !== "string") {
    return { isValid: false, error: "URL is required" };
  }

  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return { isValid: false, error: "URL is required" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return { isValid: false, error: "Invalid URL format" };
  }

  // Validate protocol
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return { isValid: false, error: "URL must use HTTP or HTTPS protocol" };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const pathParts = parsedUrl.pathname
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => decodeURIComponent(part));

  let organization: string | undefined;
  let project: string | undefined;

  // Pattern 1: dev.azure.com/{organization}/{project}
  if (hostname === "dev.azure.com") {
    if (pathParts.length < 2) {
      return { isValid: false, error: "URL must include organization and project (e.g., https://dev.azure.com/org/project)" };
    }
    organization = pathParts[0];
    project = pathParts[1];
  }
  // Pattern 2: {organization}.visualstudio.com/{project} or {organization}.visualstudio.com/DefaultCollection/{project}
  else if (hostname.endsWith(".visualstudio.com")) {
    organization = hostname.replace(".visualstudio.com", "");

    if (pathParts.length === 0) {
      return { isValid: false, error: "URL must include project name" };
    }

    // Handle DefaultCollection path
    if (pathParts[0].toLowerCase() === "defaultcollection") {
      if (pathParts.length < 2) {
        return { isValid: false, error: "URL must include project name after DefaultCollection" };
      }
      project = pathParts[1];
    } else {
      project = pathParts[0];
    }
  } else {
    return {
      isValid: false,
      error: "URL must be an Azure DevOps URL (dev.azure.com or *.visualstudio.com)",
    };
  }

  // Validate organization
  if (!organization || organization.length === 0) {
    return { isValid: false, error: "Could not extract organization from URL" };
  }

  // Validate project - skip known Azure DevOps paths that aren't projects
  const reservedPaths = ["_apis", "_git", "_build", "_release", "_settings", "_admin"];
  if (!project || project.length === 0 || reservedPaths.includes(project.toLowerCase())) {
    return { isValid: false, error: "Could not extract project from URL" };
  }

  // Skip underscore-prefixed paths as they're typically Azure DevOps routes, not projects
  if (project.startsWith("_")) {
    return { isValid: false, error: "Could not extract project from URL" };
  }

  // Sanitize organization and project names (remove any special chars for safe use in server name)
  const sanitizedOrg = sanitizeName(organization);
  const sanitizedProject = sanitizeName(project);

  if (!sanitizedOrg) {
    return { isValid: false, error: "Organization name contains only invalid characters" };
  }

  if (!sanitizedProject) {
    return { isValid: false, error: "Project name contains only invalid characters" };
  }

  return {
    isValid: true,
    organization: organization,
    project: project,
  };
}

/**
 * Sanitize a name for use in MCP server name
 * Allows alphanumeric, hyphens, and underscores
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
}

/**
 * Generate an MCP server name from organization and project
 */
export function generateServerName(organization: string, project: string): string {
  const sanitizedOrg = sanitizeName(organization);
  const sanitizedProject = sanitizeName(project);
  return `azure-devops-${sanitizedOrg}-${sanitizedProject}`;
}

/**
 * Generate a connection ID from organization and project
 */
export function generateConnectionId(organization: string, project: string): string {
  const sanitizedOrg = sanitizeName(organization);
  const sanitizedProject = sanitizeName(project);
  return `${sanitizedOrg}-${sanitizedProject}`;
}
