import * as vscode from "vscode";
import { AITemplateFile, AITemplateFileType } from "../models/aiTemplateFile";

/**
 * Data store for AI template files with indexed queries
 */
export class TemplateDataStore {
  private _templates: AITemplateFile[] = [];
  private _byRepository: Map<string, AITemplateFile[]> = new Map();
  private _byType: Map<AITemplateFileType, AITemplateFile[]> = new Map();
  private readonly _onDataChanged = new vscode.EventEmitter<void>();

  public readonly onDataChanged: vscode.Event<void> = this._onDataChanged.event;

  /**
   * Update the collection and rebuild indexes
   */
  public updateCollection(templates: AITemplateFile[]): void {
    this._templates = [...templates];
    this.rebuildIndexes();
    this._onDataChanged.fire();
  }

  /**
   * Rebuild indexes for fast queries
   */
  private rebuildIndexes(): void {
    this._byRepository.clear();
    this._byType.clear();

    for (const template of this._templates) {
      // Index by repository
      const repoTemplates = this._byRepository.get(template.repository) || [];
      repoTemplates.push(template);
      this._byRepository.set(template.repository, repoTemplates);

      // Index by type
      const typeTemplates = this._byType.get(template.type) || [];
      typeTemplates.push(template);
      this._byType.set(template.type, typeTemplates);
    }
  }

  public getAll(): ReadonlyArray<AITemplateFile> {
    return this._templates;
  }

  public getByRepository(repositoryName: string): ReadonlyArray<AITemplateFile> {
    return this._byRepository.get(repositoryName) || [];
  }

  public getByType(type: AITemplateFileType): ReadonlyArray<AITemplateFile> {
    return this._byType.get(type) || [];
  }

  public getByRepositoryAndType(repositoryName: string, type: AITemplateFileType): ReadonlyArray<AITemplateFile> {
    return this.getByRepository(repositoryName).filter((t) => t.type === type);
  }

  public getRepositoryNames(): string[] {
    return Array.from(this._byRepository.keys());
  }

  public search(query: string): ReadonlyArray<AITemplateFile> {
    const lowerQuery = query.toLowerCase();
    return this._templates.filter((t) => t.name.toLowerCase().includes(lowerQuery));
  }

  public isEmpty(): boolean {
    return this._templates.length === 0;
  }

  public getCount(): number {
    return this._templates.length;
  }

  public clear(): void {
    this._templates = [];
    this._byRepository.clear();
    this._byType.clear();
    this._onDataChanged.fire();
  }

  public dispose(): void {
    this._onDataChanged.dispose();
  }
}
