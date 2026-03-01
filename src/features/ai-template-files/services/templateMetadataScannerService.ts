import * as vscode from "vscode";
import { AITemplateFile } from "../models/aiTemplateFile";
import { TemplateMetadata } from "../models/templateMetadata";
import { TemplateMetadataService } from "./templateMetadataService";
import { AITemplateDataService } from "./aiTemplateDataService";
import { LoggingService } from "../../../shared/services/loggingService";

/**
 * Entry in the metadata index used for fuzzy search
 */
export interface TemplateMetadataEntry {
  /** Cache key: "repository::type::name" */
  key: string;
  /** Display name from frontmatter or filename fallback */
  name: string;
  /** Description from frontmatter */
  description: string;
}

/**
 * Scan progress information
 */
export interface MetadataScanProgress {
  /** Whether the scan is currently running */
  isScanning: boolean;
  /** Number of templates scanned so far */
  scannedCount: number;
  /** Total number of templates to scan */
  totalCount: number;
}

/**
 * Service that scans all templates in the background after initialization
 * to build an in-memory metadata index (name + description) for fuzzy search.
 */
export class TemplateMetadataScannerService implements vscode.Disposable {
  private readonly _logging = LoggingService.getInstance();

  /** The completed metadata index */
  private _index: TemplateMetadataEntry[] = [];

  /** Current scan progress */
  private _progress: MetadataScanProgress = {
    isScanning: false,
    scannedCount: 0,
    totalCount: 0,
  };

  /** Whether the scan has been completed at least once */
  private _scanComplete = false;

  /** Event fired when scan progress changes (started, progress, completed) */
  private readonly _onScanProgressChanged = new vscode.EventEmitter<MetadataScanProgress>();
  public readonly onScanProgressChanged: vscode.Event<MetadataScanProgress> = this._onScanProgressChanged.event;

  /** Event fired when the scan is fully complete with the final index */
  private readonly _onScanComplete = new vscode.EventEmitter<TemplateMetadataEntry[]>();
  public readonly onScanComplete: vscode.Event<TemplateMetadataEntry[]> = this._onScanComplete.event;

  /** Cancellation token for the current scan */
  private _cancellationSource: vscode.CancellationTokenSource | null = null;

  constructor(
    private readonly _metadataService: TemplateMetadataService,
    private readonly _templateDataService: AITemplateDataService
  ) {}

  /**
   * Start scanning all templates in the background.
   * Can be called after AITemplateDataService is initialized.
   * If a scan is already running, it is cancelled and restarted.
   */
  public async startScan(): Promise<void> {
    // Cancel any existing scan
    this.cancelScan();

    const templates = this._templateDataService.getAllTemplates();
    if (templates.length === 0) {
      this._logging.info("[MetadataScanner] No templates to scan");
      this._scanComplete = true;
      this._progress = { isScanning: false, scannedCount: 0, totalCount: 0 };
      this._onScanProgressChanged.fire({ ...this._progress });
      this._onScanComplete.fire([]);
      return;
    }

    this._cancellationSource = new vscode.CancellationTokenSource();
    const token = this._cancellationSource.token;

    this._index = [];
    this._scanComplete = false;
    this._progress = { isScanning: true, scannedCount: 0, totalCount: templates.length };
    this._onScanProgressChanged.fire({ ...this._progress });

    this._logging.info("[MetadataScanner] Starting background metadata scan", {
      templateCount: templates.length,
    });

    // Scan templates in small batches to avoid blocking
    const BATCH_SIZE = 5;
    for (let i = 0; i < templates.length; i += BATCH_SIZE) {
      if (token.isCancellationRequested) {
        this._logging.info("[MetadataScanner] Scan cancelled");
        return;
      }

      const batch = templates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((template) => this.scanTemplate(template)));

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          this._index.push(result.value);
        }
      }

      this._progress.scannedCount = Math.min(i + BATCH_SIZE, templates.length);
      this._onScanProgressChanged.fire({ ...this._progress });
    }

    if (!token.isCancellationRequested) {
      this._scanComplete = true;
      this._progress = { isScanning: false, scannedCount: templates.length, totalCount: templates.length };
      this._onScanProgressChanged.fire({ ...this._progress });
      this._onScanComplete.fire([...this._index]);

      this._logging.info("[MetadataScanner] Background metadata scan complete", {
        indexedCount: this._index.length,
        totalCount: templates.length,
      });
    }
  }

  /**
   * Cancel an in-progress scan
   */
  public cancelScan(): void {
    if (this._cancellationSource) {
      this._cancellationSource.cancel();
      this._cancellationSource.dispose();
      this._cancellationSource = null;
    }
  }

  /**
   * Get the current metadata index
   */
  public getIndex(): ReadonlyArray<TemplateMetadataEntry> {
    return this._index;
  }

  /**
   * Get the current scan progress
   */
  public getProgress(): MetadataScanProgress {
    return { ...this._progress };
  }

  /**
   * Whether the scan has completed at least once
   */
  public isScanComplete(): boolean {
    return this._scanComplete;
  }

  /**
   * Scan a single template and return its metadata entry
   */
  private async scanTemplate(template: AITemplateFile): Promise<TemplateMetadataEntry | null> {
    try {
      const metadata = await this._metadataService.getMetadata(template);
      if (!metadata) {
        return null;
      }

      return {
        key: `${template.repository}::${template.type}::${template.name}`,
        name: metadata.name,
        description: metadata.description,
      };
    } catch (error) {
      // Silently skip templates that fail - don't break the scan
      return null;
    }
  }

  public dispose(): void {
    this.cancelScan();
    this._onScanProgressChanged.dispose();
    this._onScanComplete.dispose();
  }
}
