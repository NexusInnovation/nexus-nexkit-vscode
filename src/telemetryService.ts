import * as vscode from "vscode";
import * as appInsights from "applicationinsights";

/**
 * Telemetry service for tracking extension usage, commands, errors, and performance metrics
 * Respects user privacy settings and VS Code telemetry configuration
 */
export class TelemetryService {
  private client: appInsights.TelemetryClient | null = null;
  private isEnabled: boolean = false;
  private sessionId: string;
  private extensionVersion: string;
  private activationTime: number;

  constructor(private context: vscode.ExtensionContext) {
    this.sessionId = this.generateSessionId();
    this.extensionVersion =
      vscode.extensions.getExtension("nexusinno.nexkit-vscode")?.packageJSON
        .version || "unknown";
    this.activationTime = Date.now();
  }

  /**
   * Initialize the telemetry service with Application Insights
   */
  public async initialize(): Promise<void> {
    try {
      // Check if telemetry is enabled
      if (!this.isTelemetryEnabled()) {
        console.log("Nexkit telemetry is disabled");
        return;
      }

      // Get connection string from environment or configuration
      const connectionString = this.getConnectionString();
      if (!connectionString) {
        console.log("Nexkit telemetry: No connection string found");
        return;
      }

      // Initialize Application Insights
      appInsights
        .setup(connectionString)
        .setAutoCollectRequests(false)
        .setAutoCollectPerformance(false)
        .setAutoCollectExceptions(true)
        .setAutoCollectDependencies(false)
        .setAutoCollectConsole(false)
        .setUseDiskRetryCaching(true)
        // Enable live metrics streaming
        // .setSendLiveMetrics(true)
        .start();

      this.client = appInsights.defaultClient;

      // Configure for immediate flushing (live telemetry)
      // Disable batching by setting flush interval to minimum
      this.client.config.maxBatchSize = 1; // Send events immediately, one at a time
      this.client.config.maxBatchIntervalMs = 0; // No delay between batches

      // Set common properties for all telemetry
      this.client.commonProperties = {
        extensionVersion: this.extensionVersion,
        vscodeVersion: vscode.version,
        platform: process.platform,
        nodeVersion: process.version,
        sessionId: this.sessionId,
      };

      this.isEnabled = true;
      console.log("Nexkit telemetry initialized successfully (live mode)");
    } catch (error) {
      console.error("Failed to initialize telemetry:", error);
      this.isEnabled = false;
    }
  }

  /**
   * Check if telemetry is enabled based on user settings
   */
  private isTelemetryEnabled(): boolean {
    // Check VS Code global telemetry setting
    const vscodeTelemetryLevel = vscode.workspace
      .getConfiguration("telemetry")
      .get<string>("telemetryLevel", "all");
    if (vscodeTelemetryLevel === "off") {
      return false;
    }

    // Check Nexkit-specific telemetry setting
    const nexkitTelemetryEnabled = vscode.workspace
      .getConfiguration("nexkit")
      .get<boolean>("telemetry.enabled", true);
    return nexkitTelemetryEnabled;
  }

  /**
   * Get Application Insights connection string
   */
  private getConnectionString(): string | undefined {
    // Priority 1: Environment variable (for development)
    const envConnectionString =
      process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    if (envConnectionString) {
      return envConnectionString;
    }

    // Priority 2: VS Code configuration (user can override)
    const configConnectionString = vscode.workspace
      .getConfiguration("nexkit")
      .get<string>("telemetry.connectionString");
    if (configConnectionString) {
      return configConnectionString;
    }

    // Priority 3: Default connection string (production)
    return "InstrumentationKey=36541b20-0c16-4477-9d5c-d6990c51bafd;IngestionEndpoint=https://canadaeast-0.in.applicationinsights.azure.com/;LiveEndpoint=https://canadaeast.livediagnostics.monitor.azure.com/;ApplicationId=d5494809-608d-4364-a30e-feaeb0769286";
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

    this.client.flush();
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

    this.client.flush();
  }

  /**
   * Track command execution
   */
  public trackCommand(
    commandName: string,
    properties?: { [key: string]: string }
  ): void {
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

    this.client.flush();
  }

  /**
   * Track chat command usage from @nexkit participant
   */
  public trackChatCommand(
    commandName: string,
    properties?: { [key: string]: string | number | boolean }
  ): void {
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
        duration:
          properties && typeof properties["durationMs"] === "number"
            ? properties["durationMs"]
            : 0,
      },
    });

    this.client.flush();
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

    this.client.flush();
  }

  /**
   * Track an error or exception
   */
  public trackError(
    error: Error,
    properties?: { [key: string]: string }
  ): void {
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

    this.client.flush();
  }

  /**
   * Track a custom event
   */
  public trackEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
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

    this.client.flush();
  }

  /**
   * Track a performance metric
   */
  public trackMetric(
    name: string,
    value: number,
    properties?: { [key: string]: string }
  ): void {
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

    this.client.flush();
  }

  /**
   * Flush telemetry data
   */
  public flush(): void {
    if (this.client) {
      this.client.flush();
    }
  }

  /**
   * Dispose of the telemetry service
   */
  public dispose(): void {
    this.trackDeactivation();
    if (this.client) {
      this.client.flush();
      // Give it a moment to flush before disposing
      setTimeout(() => {
        appInsights.dispose();
      }, 1000);
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
