import * as vscode from "vscode";

export interface AwesomeCopilotItem {
  name: string;
  title: string;
  description: string;
  category: "agents" | "prompts" | "instructions";
  rawUrl: string;
  path: string;
}

interface GitHubContentItem {
  name: string;
  path: string;
  download_url: string;
  type: string;
}

export class AwesomeCopilotService {
  private static readonly REPO_OWNER = "github";
  private static readonly REPO_NAME = "awesome-copilot";
  private static readonly BASE_URL = "https://api.github.com";
  private static readonly RAW_BASE_URL = "https://raw.githubusercontent.com";
  private static readonly GITHUB_AUTH_PROVIDER_ID = "github";
  private static readonly REQUIRED_SCOPES = ["repo"];

  private cache: Map<string, AwesomeCopilotItem[]> = new Map();
  private cacheTimestamp: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get GitHub authentication session
   */
  private async getGitHubSession(
    createIfNone: boolean = false
  ): Promise<vscode.AuthenticationSession | undefined> {
    try {
      const session = await vscode.authentication.getSession(
        AwesomeCopilotService.GITHUB_AUTH_PROVIDER_ID,
        AwesomeCopilotService.REQUIRED_SCOPES,
        { createIfNone, silent: !createIfNone }
      );
      return session;
    } catch (error) {
      console.error("Failed to get GitHub authentication session:", error);
      return undefined;
    }
  }

  /**
   * Get authentication headers for GitHub API requests
   */
  private async getAuthHeaders(
    requireAuth: boolean = false
  ): Promise<Record<string, string>> {
    const session = await this.getGitHubSession(requireAuth);
    const headers: Record<string, string> = {
      "User-Agent": "Nexkit-VSCode-Extension",
      Accept: "application/vnd.github.v3+json",
    };

    if (session) {
      headers["Authorization"] = `Bearer ${session.accessToken}`;
    }

    return headers;
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(category: string): boolean {
    const timestamp = this.cacheTimestamp.get(category);
    if (!timestamp) {
      return false;
    }
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  /**
   * Fetch all agents from the awesome-copilot repository
   */
  async fetchAgents(): Promise<AwesomeCopilotItem[]> {
    return this.fetchItems("agents");
  }

  /**
   * Fetch all prompts from the awesome-copilot repository
   */
  async fetchPrompts(): Promise<AwesomeCopilotItem[]> {
    return this.fetchItems("prompts");
  }

  /**
   * Fetch all instructions from the awesome-copilot repository
   */
  async fetchInstructions(): Promise<AwesomeCopilotItem[]> {
    return this.fetchItems("instructions");
  }

  /**
   * Fetch items from a specific category
   */
  private async fetchItems(
    category: "agents" | "prompts" | "instructions"
  ): Promise<AwesomeCopilotItem[]> {
    // Check cache first
    if (this.isCacheValid(category) && this.cache.has(category)) {
      return this.cache.get(category)!;
    }

    const url = `${AwesomeCopilotService.BASE_URL}/repos/${AwesomeCopilotService.REPO_OWNER}/${AwesomeCopilotService.REPO_NAME}/contents/${category}`;

    try {
      const headers = await this.getAuthHeaders(false);
      const response = await fetch(url, { headers });

      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          // Try with authentication
          const authHeaders = await this.getAuthHeaders(true);
          const authResponse = await fetch(url, { headers: authHeaders });
          if (!authResponse.ok) {
            throw new Error(
              `GitHub API error: ${authResponse.status} ${authResponse.statusText}`
            );
          }
          const authData = (await authResponse.json()) as GitHubContentItem[];
          return this.parseGitHubContents(authData, category);
        }
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as GitHubContentItem[];
      const items = this.parseGitHubContents(data, category);

      // Cache the results
      this.cache.set(category, items);
      this.cacheTimestamp.set(category, Date.now());

      return items;
    } catch (error) {
      console.error(`Failed to fetch ${category}:`, error);
      throw new Error(
        `Failed to fetch ${category} from awesome-copilot: ${error}`
      );
    }
  }

  /**
   * Parse GitHub contents API response into AwesomeCopilotItem array
   */
  private parseGitHubContents(
    data: GitHubContentItem[],
    category: "agents" | "prompts" | "instructions"
  ): AwesomeCopilotItem[] {
    const items: AwesomeCopilotItem[] = [];
    const extension =
      category === "agents"
        ? ".agent.md"
        : category === "prompts"
        ? ".prompt.md"
        : ".instructions.md";

    for (const item of data) {
      if (item.type === "file" && item.name.endsWith(extension)) {
        const title = this.extractTitleFromFilename(item.name, extension);
        items.push({
          name: item.name,
          title,
          description: "", // Will be populated on demand or from metadata
          category,
          rawUrl: item.download_url,
          path: item.path,
        });
      }
    }

    return items.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Extract title from filename by removing extension and converting kebab-case to Title Case
   */
  private extractTitleFromFilename(
    filename: string,
    extension: string
  ): string {
    const nameWithoutExt = filename.replace(extension, "");
    return nameWithoutExt
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Download file content from raw GitHub URL
   */
  async downloadFile(url: string): Promise<string> {
    try {
      const headers = await this.getAuthHeaders(false);
      const response = await fetch(url, { headers });

      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          // Try with authentication
          const authHeaders = await this.getAuthHeaders(true);
          const authResponse = await fetch(url, { headers: authHeaders });
          if (!authResponse.ok) {
            throw new Error(
              `Failed to download file: ${authResponse.status} ${authResponse.statusText}`
            );
          }
          return await authResponse.text();
        }
        throw new Error(
          `Failed to download file: ${response.status} ${response.statusText}`
        );
      }

      return await response.text();
    } catch (error) {
      throw new Error(`Failed to download file from ${url}: ${error}`);
    }
  }

  /**
   * Parse frontmatter from markdown file to extract description
   */
  parseFrontmatter(content: string): {
    description?: string;
    [key: string]: any;
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {};
    }

    const frontmatterText = match[1];
    const metadata: any = {};

    // Simple YAML parser for common fields
    const lines = frontmatterText.split("\n");
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line
          .substring(colonIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        metadata[key] = value;
      }
    }

    return metadata;
  }

  /**
   * Fetch description for an item by downloading and parsing the file
   */
  async fetchDescription(item: AwesomeCopilotItem): Promise<string> {
    try {
      const content = await this.downloadFile(item.rawUrl);
      const metadata = this.parseFrontmatter(content);
      return metadata.description || "";
    } catch (error) {
      console.error(`Failed to fetch description for ${item.name}:`, error);
      return "";
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamp.clear();
  }
}
