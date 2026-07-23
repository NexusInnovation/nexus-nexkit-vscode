import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { LoggingService } from "../../shared/services/loggingService";
import { SettingsManager } from "../../core/settingsManager";

/**
 * Maximum accepted input size (10MB), enforced before anything is written to disk.
 */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * Soft timeout: sends SIGTERM to the markitdown child process if it hasn't finished yet.
 */
const SOFT_TIMEOUT_MS = 30_000;

/**
 * Hard timeout grace period after SIGTERM: sends SIGKILL if the process is still alive.
 */
const HARD_TIMEOUT_GRACE_MS = 5_000;

/**
 * Python interpreter candidates tried, in order, when no explicit path is configured.
 */
const CANDIDATE_INTERPRETERS = ["python3", "python", "py"];

/**
 * Forces the spawned Python process into UTF-8 mode regardless of the host OS locale
 * or active console code page. Without this, CPython on Windows falls back to
 * `locale.getpreferredencoding()` (e.g. cp1252 on a French Windows install) for stdio
 * streams whenever stdout/stderr is piped rather than attached to a real console TTY,
 * corrupting any non-ASCII characters written by markitdown.
 */
const FORCE_UTF8_ENV = {
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
};

/**
 * Extensions markitdown is expected to handle. Used to validate an uploaded file's
 * extension before it is reused to build a sandboxed temp file name.
 */
const ALLOWED_FILE_EXTENSIONS = [
  ".docx",
  ".rtf",
  ".html",
  ".htm",
  ".pptx",
  ".pdf",
  ".xlsx",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
];

export interface MarkitdownAvailability {
  available: boolean;
  reason?: string;
}

/**
 * Host-side conversion service backed by a Python subprocess running microsoft/markitdown.
 * Defined as an interface for DI/mocking in tests.
 */
export interface IMarkitdownConversionService {
  /**
   * Detects whether a usable Python interpreter with markitdown installed is available.
   * Result is cached in-memory for the lifetime of the extension host session.
   */
  checkAvailability(): Promise<MarkitdownAvailability>;

  /**
   * Clears the cached availability result so the next call to checkAvailability() re-probes.
   */
  invalidateAvailabilityCache(): void;

  /** Converts a raw pasted HTML string to Markdown. */
  convertHtml(html: string): Promise<string>;

  /** Converts a raw pasted plain-text string to Markdown. */
  convertText(text: string): Promise<string>;

  /** Converts an uploaded file's bytes to Markdown, using the original filename's extension. */
  convertFile(fileName: string, data: Uint8Array): Promise<string>;
}

/**
 * Converts pasted content and uploaded files to Markdown by delegating to a Python
 * subprocess running `microsoft/markitdown`. Never runs in the webview: webviews cannot
 * spawn processes, so this must run in the extension host.
 */
export class MarkitdownConversionService implements IMarkitdownConversionService {
  private _availabilityCache: { interpreter: string; result: MarkitdownAvailability } | undefined;

  public constructor(private readonly _logging: LoggingService) {}

  public async checkAvailability(): Promise<MarkitdownAvailability> {
    if (this._availabilityCache) {
      return this._availabilityCache.result;
    }

    const configuredPath = SettingsManager.getConvertToMarkdownPythonPath();
    const candidates = configuredPath ? [configuredPath] : CANDIDATE_INTERPRETERS;

    for (const candidate of candidates) {
      const found = await this._probeInterpreter(candidate);
      if (found) {
        const result: MarkitdownAvailability = { available: true };
        this._availabilityCache = { interpreter: candidate, result };
        return result;
      }
    }

    const reason = configuredPath
      ? `The configured Python interpreter ("${configuredPath}") could not be used to run markitdown. Verify the path and that markitdown is installed (pip install markitdown).`
      : "No Python interpreter with markitdown installed was found (tried python3, python, py). Install Python and run: pip install markitdown";
    const result: MarkitdownAvailability = { available: false, reason };
    this._availabilityCache = { interpreter: "", result };
    return result;
  }

  public invalidateAvailabilityCache(): void {
    this._availabilityCache = undefined;
  }

  public async convertHtml(html: string): Promise<string> {
    return this._convert(Buffer.from(html, "utf8"), ".html");
  }

  public async convertText(text: string): Promise<string> {
    return this._convert(Buffer.from(text, "utf8"), ".txt");
  }

  public async convertFile(fileName: string, data: Uint8Array): Promise<string> {
    const extension = this._extractValidatedExtension(fileName);
    return this._convert(Buffer.from(data), extension);
  }

  /**
   * Shared conversion pipeline: size guard, sandboxed temp file, spawn markitdown,
   * collect stdout, and always clean up the temp directory.
   */
  private async _convert(content: Buffer, extension: string): Promise<string> {
    if (content.byteLength > MAX_INPUT_BYTES) {
      throw new Error("The input exceeds the 10MB Convert to Markdown limit.");
    }

    const interpreter = await this._resolveInterpreter();

    let tempDir: string | undefined;
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-convert-"));
      const tempFileName = `${randomUUID()}${extension}`;
      const tempFilePath = path.join(tempDir, tempFileName);
      fs.writeFileSync(tempFilePath, content);

      return await this._runMarkitdown(interpreter, tempFilePath);
    } catch (error) {
      this._logging.error("Convert to Markdown conversion failed", error);
      throw new Error("Conversion failed. See the Nexkit output log for details.");
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  private async _resolveInterpreter(): Promise<string> {
    const availability = await this.checkAvailability();
    if (!availability.available || !this._availabilityCache?.interpreter) {
      throw new Error(availability.reason ?? "Python interpreter for Convert to Markdown is not available.");
    }
    return this._availabilityCache.interpreter;
  }

  private _runMarkitdown(interpreter: string, filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(interpreter, ["-m", "markitdown", filePath], {
        shell: false,
        env: { ...process.env, ...FORCE_UTF8_ENV },
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let softTimer: NodeJS.Timeout | undefined;
      let hardTimer: NodeJS.Timeout | undefined;

      const clearTimers = (): void => {
        if (softTimer) {
          clearTimeout(softTimer);
        }
        if (hardTimer) {
          clearTimeout(hardTimer);
        }
      };

      softTimer = setTimeout(() => {
        child.kill("SIGTERM");
        hardTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, HARD_TIMEOUT_GRACE_MS);
      }, SOFT_TIMEOUT_MS);

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimers();
        this._logging.error("markitdown process failed to start", error);
        reject(new Error("Conversion failed. Unable to start the Python conversion process."));
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimers();
        if (code === 0) {
          resolve(stdout);
        } else {
          this._logging.error(`markitdown process exited with code ${code}`, stderr);
          reject(new Error("Conversion failed. The conversion process exited with an error."));
        }
      });
    });
  }

  private _probeInterpreter(interpreter: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const child = spawn(interpreter, ["-m", "markitdown", "--help"], {
          shell: false,
          env: { ...process.env, ...FORCE_UTF8_ENV },
        });
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Extracts and validates a file extension from an (untrusted) original filename.
   * Only the extension is ever reused — the raw filename is never used as a path.
   */
  private _extractValidatedExtension(fileName: string): string {
    const base = path.basename(fileName);
    const ext = path.extname(base).toLowerCase();
    return ALLOWED_FILE_EXTENSIONS.includes(ext) ? ext : "";
  }
}
