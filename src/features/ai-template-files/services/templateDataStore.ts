import * as vscode from "vscode";
import { AITemplateCollection } from "../models/aiTemplateCollection";
import { AITemplateFile, AITemplateFileType } from "../models/aiTemplateFile";

/**
 * Thread-safe data store for AI template files
 * Holds the current collection and provides type-safe query methods
 */
export class TemplateDataStore {
  private _collection: AITemplateCollection = AITemplateCollection.empty();
  private readonly _onDataChanged = new vscode.EventEmitter<void>();

  /**
   * Event emitted when data changes
   */
  public readonly onDataChanged: vscode.Event<void> = this._onDataChanged.event;

  /**
   * Update the entire collection
   */
  public updateCollection(templates: AITemplateFile[]): void {
    this._collection = new AITemplateCollection(templates);
    this._onDataChanged.fire();
  }

  /**
   * Get all templates
   */
  public getAll(): ReadonlyArray<AITemplateFile> {
    return this._collection.getAll();
  }

  /**
   * Get templates by repository name
   */
  public getByRepository(repositoryName: string): ReadonlyArray<AITemplateFile> {
    return this._collection.getByRepository(repositoryName);
  }

  /**
   * Get templates by type
   */
  public getByType(type: AITemplateFileType): ReadonlyArray<AITemplateFile> {
    return this._collection.getByType(type);
  }

  /**
   * Get templates by repository and type
   */
  public getByRepositoryAndType(repositoryName: string, type: AITemplateFileType): ReadonlyArray<AITemplateFile> {
    return this._collection.getByRepositoryAndType(repositoryName, type);
  }

  /**
   * Get all repository names
   */
  public getRepositoryNames(): string[] {
    return this._collection.getRepositoryNames();
  }

  /**
   * Search templates by name
   */
  public search(query: string): ReadonlyArray<AITemplateFile> {
    return this._collection.search(query);
  }

  /**
   * Get the complete collection (immutable)
   */
  public getCollection(): AITemplateCollection {
    return this._collection;
  }

  /**
   * Check if store is empty
   */
  public isEmpty(): boolean {
    return this._collection.isEmpty;
  }

  /**
   * Get total count
   */
  public getCount(): number {
    return this._collection.count;
  }

  /**
   * Clear all data
   */
  public clear(): void {
    this._collection = AITemplateCollection.empty();
    this._onDataChanged.fire();
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this._onDataChanged.dispose();
  }
}
