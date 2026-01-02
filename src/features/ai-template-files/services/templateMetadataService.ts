import { AITemplateFile } from "../models/aiTemplateFile";
import { TemplateMetadata } from "../models/templateMetadata";
import { RepositoryManager } from "./repositoryManager";

/**
 * Service responsible for fetching and caching template metadata (name, description)
 * Extracts metadata from YAML frontmatter in markdown files
 */
export class TemplateMetadataService {
  private readonly _cache: Map<string, TemplateMetadata>;

  constructor(private readonly repositoryManager: RepositoryManager) {
    this._cache = new Map();
  }

  /**
   * Get metadata for a template (cached or fetched)
   * Returns null if fetch/parse fails
   */
  public async getMetadata(template: AITemplateFile): Promise<TemplateMetadata | null> {
    const cacheKey = this.getCacheKey(template);

    // Return cached value if available
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey)!;
    }

    // Fetch and parse metadata
    try {
      const provider = this.repositoryManager.getProvider(template.repository);
      if (!provider) {
        throw new Error(`Repository provider not found: ${template.repository}`);
      }

      const content = await provider.downloadTemplate(template);
      const metadata = this.parseMetadata(content, template.name);

      // Cache the result
      this._cache.set(cacheKey, metadata);

      return metadata;
    } catch (error) {
      console.error(`Failed to fetch metadata for ${template.name}:`, error);
      return null;
    }
  }

  /**
   * Clear the metadata cache (useful for testing or refresh)
   */
  public clearCache(): void {
    this._cache.clear();
  }

  /**
   * Parse metadata from markdown content with YAML frontmatter
   * Supports flexible frontmatter with name and/or description fields
   */
  private parseMetadata(content: string, filename: string): TemplateMetadata {
    const defaultName = filename.replace(/\.md$/, "");
    const metadata: TemplateMetadata = {
      name: defaultName,
      description: "",
    };

    // Extract YAML frontmatter (between --- markers)
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return metadata;
    }

    const frontmatter = frontmatterMatch[1];

    // Parse YAML frontmatter manually (simple key-value pairs)
    // This handles flexible ordering and optional fields
    const lines = frontmatter.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      // Match "key: value" or "key : value" patterns
      const match = trimmedLine.match(/^(\w+)\s*:\s*(.+)$/);
      if (!match) {
        continue;
      }

      const [, key, value] = match;
      const normalizedKey = key.toLowerCase();
      const cleanValue = value.trim().replace(/^["']|["']$/g, ""); // Remove quotes

      if (normalizedKey === "name") {
        metadata.name = cleanValue;
      } else if (normalizedKey === "description") {
        metadata.description = cleanValue;
      }
    }

    return metadata;
  }

  /**
   * Generate cache key for a template
   */
  private getCacheKey(template: AITemplateFile): string {
    return `${template.repository}::${template.type}::${template.name}`;
  }
}
