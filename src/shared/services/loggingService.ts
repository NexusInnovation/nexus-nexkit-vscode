import * as vscode from "vscode";

/**
 * Log levels for the logging service
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Logging service for the Nexkit extension
 * Provides centralized logging to VS Code output panel
 */
export class LoggingService {
  private outputChannel: vscode.LogOutputChannel;
  private logLevel: LogLevel = LogLevel.INFO;
  private static instance: LoggingService | undefined;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Nexkit", { log: true });
  }

  /**
   * Get or create the singleton instance
   */
  public static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  /**
   * Set the log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(`Log level set to: ${LogLevel[level]}`);
  }

  /**
   * Log a debug message (only if log level is DEBUG)
   */
  public debug(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.outputChannel.debug(message);
      this.showData(data);
    }
  }

  /**
   * Log an info message
   */
  public info(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.outputChannel.info(message);
      this.showData(data);
    }
  }

  /**
   * Log a warning message
   */
  public warn(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.WARN) {
      this.outputChannel.warn(message);
      this.showData(data);
    }
  }

  /**
   * Log an error message
   */
  public error(message: string, error?: Error | unknown): void {
    if (this.logLevel <= LogLevel.ERROR) {
      this.outputChannel.error(message);
      this.showData(error);
      if (error instanceof Error) {
        this.outputChannel.error(`  Error: ${error.message}`);
        if (error.stack) {
          this.outputChannel.error(`  Stack: ${error.stack}`);
        }
      } else if (error) {
        this.outputChannel.error(`  Details: ${JSON.stringify(error)}`);
      }
    }
  }

  /**
   * Show the output panel
   */
  public show(): void {
    this.outputChannel.show();
  }

  /**
   * Clear all logs
   */
  public clear(): void {
    this.outputChannel.clear();
  }

  /**
   * Dispose of the output channel
   */
  public dispose(): void {
    this.outputChannel.dispose();
  }

  /**
   * Internal logging method and colorized to match log level (if supported by output channel)
   */
  private showData(data?: unknown): void {
    // Format timestamp to match YYYY-MM-DD HH:mm:ss.SSS
    if (data !== undefined) {
      try {
        const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        this.outputChannel.appendLine(`  Data: ${dataStr}`);
      } catch (error) {
        this.outputChannel.appendLine(`  Data: [Unable to stringify data]`);
      }
    }
  }

  /**
   * Format a Date as YYYY-MM-DD HH:mm:ss.SSS (local time).
   */
  private formatTimestamp(date: Date): string {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const pad3 = (n: number) => String(n).padStart(3, "0");

    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const hours = pad2(date.getHours());
    const minutes = pad2(date.getMinutes());
    const seconds = pad2(date.getSeconds());
    const millis = pad3(date.getMilliseconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
  }
}
