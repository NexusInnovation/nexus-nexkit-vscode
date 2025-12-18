import { AITemplateFile, AITemplateFileType } from "./aiTemplateFile";

/**
 * Immutable collection of AI templates indexed by repository and type
 */
export class AITemplateCollection {
  private readonly _templates: ReadonlyArray<AITemplateFile>;
  private readonly _byRepository: ReadonlyMap<string, AITemplateFile[]>;
  private readonly _byType: ReadonlyMap<AITemplateFileType, AITemplateFile[]>;

  constructor(templates: AITemplateFile[]) {
    this._templates = Object.freeze([...templates]);
    this._byRepository = this.indexByRepository(templates);
    this._byType = this.indexByType(templates);
  }

  /**
   * Index templates by repository name
   */
  private indexByRepository(templates: AITemplateFile[]): ReadonlyMap<string, AITemplateFile[]> {
    const map = new Map<string, AITemplateFile[]>();
    for (const template of templates) {
      const existing = map.get(template.repository) || [];
      map.set(template.repository, [...existing, template]);
    }
    return map;
  }

  /**
   * Index templates by type
   */
  private indexByType(templates: AITemplateFile[]): ReadonlyMap<AITemplateFileType, AITemplateFile[]> {
    const map = new Map<AITemplateFileType, AITemplateFile[]>();
    for (const template of templates) {
      const existing = map.get(template.type) || [];
      map.set(template.type, [...existing, template]);
    }
    return map;
  }

  /**
   * Get all templates
   */
  public getAll(): ReadonlyArray<AITemplateFile> {
    return this._templates;
  }

  /**
   * Get templates by repository name
   */
  public getByRepository(repositoryName: string): ReadonlyArray<AITemplateFile> {
    return this._byRepository.get(repositoryName) || [];
  }

  /**
   * Get templates by type
   */
  public getByType(type: AITemplateFileType): ReadonlyArray<AITemplateFile> {
    return this._byType.get(type) || [];
  }

  /**
   * Get all repository names
   */
  public getRepositoryNames(): string[] {
    return Array.from(this._byRepository.keys());
  }

  /**
   * Get templates by repository and type
   */
  public getByRepositoryAndType(repositoryName: string, type: AITemplateFileType): ReadonlyArray<AITemplateFile> {
    return this.getByRepository(repositoryName).filter((t) => t.type === type);
  }

  /**
   * Search templates by name
   */
  public search(query: string): ReadonlyArray<AITemplateFile> {
    const lowerQuery = query.toLowerCase();
    return this._templates.filter((t) => t.name.toLowerCase().includes(lowerQuery));
  }

  /**
   * Get total count of templates
   */
  public get count(): number {
    return this._templates.length;
  }

  /**
   * Check if collection is empty
   */
  public get isEmpty(): boolean {
    return this._templates.length === 0;
  }

  /**
   * Create empty collection
   */
  public static empty(): AITemplateCollection {
    return new AITemplateCollection([]);
  }
}
