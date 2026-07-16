import * as vscode from "vscode";
import * as appInsights from "applicationinsights";
import * as os from "os";
import * as https from "https";
import { diag, DiagLogLevel, type DiagLogger } from "@opentelemetry/api";
import { SettingsManager } from "../../core/settingsManager";
import { getExtensionVersion } from "../utils/extensionHelper";
import { LoggingService } from "./loggingService";

type TelemetryStatus = {
  enabled: boolean;
  reason?: "vscode_off" | "nexkit_disabled";
  vscodeTelemetryLevel: string;
  nexkitTelemetryEnabled: boolean;
};

type ConnectionStringValidation = {
  valid: boolean;
  reason?: string;
};

type ConnectionStringParts = {
  instrumentationKey?: string;
  ingestionEndpoint?: string;
};

/**
 * Telemetry service for tracking extension usage, commands, errors, and performance metrics
 * Respects user privacy settings and VS Code telemetry configuration
 *
 * ⚠️ PRIVACY NOTICE: This service collects PII including username and IP address.
 * Ensure compliance with privacy regulations (GDPR, CCPA, etc.) and obtain proper user consent.
 */
export class TelemetryService {
  private client: appInsights.TelemetryClient | null = null;
  private isEnabled: boolean = false;
  private sessionId: string;
  private extensionVersion: string;
  private activationTime: number;
  private cachedPublicIP: string | null = null;
  private username: string;
  private readonly logging: LoggingService;

  private static readonly TRANSPORT_MODE = "isolated-client-batch";
  private static readonly MAX_BATCH_SIZE = 50;
  private static readonly MAX_BATCH_INTERVAL_MS = 15000;
  private static otelDiagnosticsConfigured = false;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.extensionVersion = getExtensionVersion() || "unknown";
    this.activationTime = Date.now();
    this.username = this.getUsername();
    this.logging = LoggingService.getInstance();
  }

  /**
   * Get the OS username
   * @returns The current OS username
   */
  private getUsername(): string {
    try {
      return os.userInfo().username;
    } catch (error) {
      console.error("Failed to get username:", error);
      return "unknown";
    }
  }

  /**
   * Fetch the public IP address from an external service
   * Uses caching to avoid repeated requests
   * @returns Promise resolving to IP address or "unavailable" on failure
   */
  private async fetchPublicIP(): Promise<string> {
    // Return cached IP if available
    if (this.cachedPublicIP) {
      return this.cachedPublicIP;
    }

    return new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        console.log("IP fetch timeout - using unavailable");
        resolve("unavailable");
      }, 5000);

      https
        .get("https://api.ipify.org?format=json", (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            clearTimeout(timeout);
            try {
              const json = JSON.parse(data);
              const ip = json.ip || "unavailable";
              this.cachedPublicIP = ip;
              resolve(ip);
            } catch (error) {
              console.error("Failed to parse IP response:", error);
              resolve("unavailable");
            }
          });
        })
        .on("error", (error) => {
          clearTimeout(timeout);
          console.error("Failed to fetch public IP:", error);
          resolve("unavailable");
        });
    });
  }

  /**
   * Initialize the telemetry service with Application Insights
   */
  public async initialize(): Promise<void> {
    try {
      this.configureSdkDiagnostics();

      const telemetryStatus = this.getTelemetryStatus();

      if (!telemetryStatus.enabled) {
        if (telemetryStatus.reason === "vscode_off") {
          this.logging.info(
            `Telemetry disabled: VS Code telemetry level is '${telemetryStatus.vscodeTelemetryLevel}'.`
          );
        } else {
          this.logging.info("Telemetry disabled: nexkit.telemetry.enabled is false.");
        }
        return;
      }

      const connectionString = this.getConnectionString();
      if (!connectionString) {
        this.logging.warn("Telemetry disabled: no Application Insights connection string configured.");
        return;
      }

      const validation = this.validateConnectionString(connectionString);
      if (!validation.valid) {
        this.logging.error(
          `Telemetry disabled: invalid Application Insights connection string (${validation.reason ?? "invalid format"}).`
        );
        return;
      }

      const connectionStringParts = this.parseConnectionString(connectionString);

      this.client = this.createTelemetryClient(connectionString);
      this.client.config.maxBatchSize = TelemetryService.MAX_BATCH_SIZE;
      this.client.config.maxBatchIntervalMs = TelemetryService.MAX_BATCH_INTERVAL_MS;

      const publicIP = await this.fetchPublicIP();

      this.client.commonProperties = {
        extensionVersion: this.extensionVersion,
        vscodeVersion: vscode.version,
        platform: process.platform,
        nodeVersion: process.version,
        sessionId: this.sessionId,
        username: this.username,
        ipAddress: publicIP,
      };

      this.isEnabled = true;

      this.logging.info(
        `Telemetry initialized successfully (version=${this.extensionVersion}, mode=${TelemetryService.TRANSPORT_MODE}, batchSize=${TelemetryService.MAX_BATCH_SIZE}, batchIntervalMs=${TelemetryService.MAX_BATCH_INTERVAL_MS}).`
      );

      this.logTelemetryTarget(connectionStringParts);

      this.trackTelemetryHealthEvent(telemetryStatus);
    } catch (error) {
      this.logging.error(
        "Telemetry initialization failed: telemetry pipeline unavailable for this session.",
        error
      );
      this.isEnabled = false;
      this.client = null;
    }
  }

  /**
   * Check if telemetry is enabled based on user settings
   */
  private getTelemetryStatus(): TelemetryStatus {
    const vscodeTelemetryLevel = SettingsManager.getVSCodeTelemetryLevel();
    const nexkitTelemetryEnabled = SettingsManager.isNexkitTelemetryEnabled();

    if (vscodeTelemetryLevel === "off") {
      return {
        enabled: false,
        reason: "vscode_off",
        vscodeTelemetryLevel,
        nexkitTelemetryEnabled,
      };
    }

    if (!nexkitTelemetryEnabled) {
      return {
        enabled: false,
        reason: "nexkit_disabled",
        vscodeTelemetryLevel,
        nexkitTelemetryEnabled,
      };
    }

    return {
      enabled: true,
      vscodeTelemetryLevel,
      nexkitTelemetryEnabled,
    };
  }

  /**
   * Get Application Insights connection string
   */
  private getConnectionString(): string | undefined {
    const fromSettings = SettingsManager.getTelemetryConnectionString();
    if (typeof fromSettings === "string" && fromSettings.trim().length > 0) {
      return fromSettings.trim();
    }

    return undefined;
  }

  private createTelemetryClient(connectionString: string): appInsights.TelemetryClient {
    return new appInsights.TelemetryClient(connectionString);
  }

  private configureSdkDiagnostics(): void {
    if (TelemetryService.otelDiagnosticsConfigured) {
      return;
    }

    const logger: DiagLogger = {
      error: (...args: unknown[]) => {
        this.logging.error("[Telemetry SDK] Export error", args.length === 1 ? args[0] : args);
      },
      warn: (...args: unknown[]) => {
        this.logging.warn("[Telemetry SDK] Warning", args.length === 1 ? args[0] : args);
      },
      info: (...args: unknown[]) => {
        this.logging.debug("[Telemetry SDK] Info", args.length === 1 ? args[0] : args);
      },
      debug: (...args: unknown[]) => {
        this.logging.debug("[Telemetry SDK] Debug", args.length === 1 ? args[0] : args);
      },
      verbose: (...args: unknown[]) => {
        this.logging.debug("[Telemetry SDK] Verbose", args.length === 1 ? args[0] : args);
      },
    };

    diag.setLogger(logger, DiagLogLevel.WARN);
    TelemetryService.otelDiagnosticsConfigured = true;
    this.logging.info("Telemetry SDK diagnostics enabled (OpenTelemetry diag level: WARN).");
  }

  private validateConnectionString(connectionString: string): ConnectionStringValidation {
    const parts = this.parseConnectionString(connectionString);
    const entries = connectionString
      .split(";")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    if (entries.length === 0) {
      return { valid: false, reason: "empty value" };
    }

    const values = new Map<string, string>();
    for (const entry of entries) {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        return { valid: false, reason: "malformed key/value segment" };
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!key || !value) {
        return { valid: false, reason: "empty key or value" };
      }

      values.set(key, value);
    }

    const instrumentationKey = parts.instrumentationKey;
    if (!instrumentationKey) {
      return { valid: false, reason: "InstrumentationKey is missing" };
    }

    const guidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!guidPattern.test(instrumentationKey)) {
      return { valid: false, reason: "InstrumentationKey is not a valid GUID" };
    }

    return { valid: true };
  }

  private parseConnectionString(connectionString: string): ConnectionStringParts {
    const parts: ConnectionStringParts = {};
    const entries = connectionString
      .split(";")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    for (const entry of entries) {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        continue;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!value) {
        continue;
      }

      if (key === "InstrumentationKey") {
        parts.instrumentationKey = value;
      }

      if (key === "IngestionEndpoint") {
        parts.ingestionEndpoint = value;
      }
    }

    return parts;
  }

  private logTelemetryTarget(parts: ConnectionStringParts): void {
    const endpoint = parts.ingestionEndpoint ?? "(not set)";
    const key = parts.instrumentationKey ?? "";
    const keyFingerprint = key.length >= 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "(invalid)";

    this.logging.info(`Telemetry target: ingestionEndpoint=${endpoint}, instrumentationKey=${keyFingerprint}`);
  }

  private safeFlush(context: string): void {
    if (!this.client) {
      return;
    }

    Promise.resolve(this.client.flush()).catch((error) => {
      this.logging.error(`Telemetry flush failed (${context}).`, error);
    });
  }

  private trackTelemetryHealthEvent(telemetryStatus: TelemetryStatus): void {
    if (!this.client) {
      return;
    }

    this.client.trackEvent({
      name: "telemetry.health.startup",
      properties: {
        extensionVersion: this.extensionVersion,
        sessionId: this.sessionId,
        vscodeTelemetryLevel: telemetryStatus.vscodeTelemetryLevel,
        nexkitTelemetryEnabled: String(telemetryStatus.nexkitTelemetryEnabled),
      },
    });

    this.safeFlush("telemetry.health.startup");
  }

  /**
   * Generate a unique session ID for this extension activation
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Track extension activation event
   */
  public trackActivation(): void {
    if (!this.isEnabled || !this.client) {
      return;
    }

    this.client.trackEvent({
      name: "extension.activated",
      properties: {
        timestamp: new Date().toISOString(),
      },
      measurements: {
        duration: Date.now() - this.activationTime,
      },
    });

    this.safeFlush("extension.activated");
  }

  /**
   * Track extension deactivation and session duration
   */
  public trackDeactivation(): void {
    if (!this.isEnabled || !this.client) {
      return;
    }

    const sessionDuration = Date.now() - this.activationTime;

    this.client.trackEvent({
      name: "extension.deactivated",
      properties: {
        sessionDurationMs: sessionDuration.toString(),
        timestamp: new Date().toISOString(),
      },
      measurements: {
        sessionDuration: sessionDuration,
      },
    });

    this.safeFlush("extension.deactivated");
  }

  /**
   * Track command execution
   */
  public trackCommand(commandName: string, properties?: { [key: string]: string }): void {
    if (!this.isEnabled || !this.client) {
      return;
    }

    this.client.trackEvent({
      name: "command.executed",
      properties: {
        commandName: commandName,
        timestamp: new Date().toISOString(),
        ...properties,
      },
    });
  }

  /**
   * Track chat command usage from @nexkit participant
   */
  public trackChatCommand(commandName: string, properties?: { [key: string]: string | number | boolean }): void {
    if (!this.isEnabled || !this.client) {
      return;
    }

    // Convert all properties to strings for Application Insights
    const stringProperties: { [key: string]: string } = {};
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        stringProperties[key] = String(value);
      }
    }

    this.client.trackEvent({
      name: "chat.command.executed",
      properties: {
        commandName: commandName,
        timestamp: new Date().toISOString(),
        ...stringProperties,
      },
      measurements: {
        duration: properties && typeof properties["durationMs"] === "number" ? properties["durationMs"] : 0,
      },
    });
  }

  /**
   * Track command execution with duration
   */
  public trackCommandWithDuration(
    commandName: string,
    durationMs: number,
    success: boolean,
    properties?: { [key: string]: string }
  ): void {
    if (!this.isEnabled || !this.client) {
      return;
    }

    this.client.trackEvent({
      name: "command.executed",
      properties: {
        commandName: commandName,
        success: success.toString(),
        timestamp: new Date().toISOString(),
        ...properties,
      },
      measurements: {
        duration: durationMs,
      },
    });
  }

  /**
   * Track an error or exception
   */
  public trackError(error: Error, properties?: { [key: string]: string }): void {
    if (!this.isEnabled || !this.client) {
      return;
    }

    this.client.trackException({
      exception: error,
      properties: {
        timestamp: new Date().toISOString(),
        ...properties,
      },
    });

    this.safeFlush("trackError");
  }

  /**
   * Track a custom event
   */
  public trackEvent(eventName: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }): void {
    if (!this.isEnabled || !this.client) {
      return;
    }

    this.client.trackEvent({
      name: eventName,
      properties: {
        timestamp: new Date().toISOString(),
        ...properties,
      },
      measurements,
    });
  }

  /**
   * Track a performance metric
   */
  public trackMetric(name: string, value: number, properties?: { [key: string]: string }): void {
    if (!this.isEnabled || !this.client) {
      return;
    }

    this.client.trackMetric({
      name: name,
      value: value,
      properties: {
        timestamp: new Date().toISOString(),
        ...properties,
      },
    });
  }

  /**
   * Flush telemetry data
   */
  public flush(): void {
    if (this.client) {
      this.safeFlush("manual.flush");
    }
  }

  /**
   * Dispose of the telemetry service
   */
  public dispose(): void {
    this.trackDeactivation();
    if (this.client) {
      this.safeFlush("dispose");
    }
  }

  /**
   * Helper method to wrap command execution with telemetry tracking
   */
  public async trackCommandExecution<T>(
    commandName: string,
    commandFn: () => Promise<T>,
    properties?: { [key: string]: string }
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let error: Error | undefined;

    try {
      const result = await commandFn();
      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      if (error) {
        this.trackError(error, {
          commandName: commandName,
          ...properties,
        });
      }

      this.trackCommandWithDuration(commandName, duration, success, properties);
    }
  }
}
