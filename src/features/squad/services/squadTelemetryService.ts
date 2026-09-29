import { SettingsManager } from "../../../core/settingsManager";
import { TelemetryService } from "../../../shared/services/telemetryService";
import { SQUAD_ERROR_CODES, SquadErrorCode } from "../models";

export const SQUAD_TELEMETRY_EVENT_NAME = "squad.feature.used";

export const SquadTelemetryFeature = {
  CliSetup: "cli-setup",
  Detection: "detection",
  Doctor: "doctor",
  Export: "export",
  ModelConfig: "model-config",
  Plugins: "plugins",
  Presets: "presets",
  State: "state",
  Upstreams: "upstreams",
  Updates: "updates",
  Write: "write",
} as const;

export type SquadTelemetryFeature = (typeof SquadTelemetryFeature)[keyof typeof SquadTelemetryFeature];

export const SquadTelemetryOutcome = {
  Success: "success",
  Failure: "failure",
  Partial: "partial",
  Cancelled: "cancelled",
} as const;

export type SquadTelemetryOutcome = (typeof SquadTelemetryOutcome)[keyof typeof SquadTelemetryOutcome];

type SquadTelemetryPrimitive = boolean | number | string | null | undefined;

export interface SquadFeatureTelemetryEvent {
  feature: SquadTelemetryFeature;
  action: string;
  outcome: SquadTelemetryOutcome;
  errorCode?: SquadErrorCode;
  properties?: Record<string, SquadTelemetryPrimitive>;
  measurements?: Record<string, number | undefined>;
}

const SAFE_PROPERTY_KEYS = new Set([
  "backupCreated",
  "changed",
  "cliInstalled",
  "cliSource",
  "cliVersionStatus",
  "created",
  "docKind",
  "hasMarketplaces",
  "hasPlugins",
  "hasUpstreams",
  "hasWorkspace",
  "operation",
  "projectInstallState",
  "projectVersionStatus",
  "source",
  "targetKind",
]);

const SAFE_MEASUREMENT_KEYS = new Set([
  "charterCount",
  "logCount",
  "marketplaceCount",
  "pluginCount",
  "presetCount",
  "rejectedPresetCount",
  "rosterCount",
  "unreachableSourceCount",
  "upstreamCount",
]);

const SAFE_VALUE_PATTERN = /^[a-zA-Z0-9_.:-]{1,80}$/;
const SQUAD_ERROR_CODE_SET = new Set<string>(SQUAD_ERROR_CODES);

/**
 * Emits anonymous Squad journey telemetry through the existing NexKit telemetry
 * service. The wrapper enforces the additional Squad opt-out and a strict
 * allowlist of non-identifying properties so file names, paths, workspace names,
 * user content and secrets cannot be forwarded by feature handlers.
 */
export class SquadTelemetryService {
  constructor(private readonly _telemetry: Pick<TelemetryService, "trackEvent">) {}

  public trackFeatureUsage(event: SquadFeatureTelemetryEvent): void {
    if (!this._isTelemetryEnabled()) {
      return;
    }

    const properties: Record<string, string> = {
      feature: event.feature,
      action: this._sanitizeValue(event.action),
      outcome: event.outcome,
    };

    if (event.errorCode) {
      properties.errorCode = this._sanitizeErrorCode(event.errorCode);
    }

    for (const [key, value] of Object.entries(event.properties ?? {})) {
      if (!SAFE_PROPERTY_KEYS.has(key)) {
        continue;
      }
      const sanitized = this._sanitizePrimitive(value);
      if (sanitized !== undefined) {
        properties[key] = sanitized;
      }
    }

    const measurements = this._sanitizeMeasurements(event.measurements ?? {});
    this._telemetry.trackEvent(
      SQUAD_TELEMETRY_EVENT_NAME,
      properties,
      Object.keys(measurements).length > 0 ? measurements : undefined
    );
  }

  private _isTelemetryEnabled(): boolean {
    return (
      SettingsManager.getVSCodeTelemetryLevel() !== "off" &&
      SettingsManager.isNexkitTelemetryEnabled() &&
      SettingsManager.isSquadTelemetryEnabled()
    );
  }

  private _sanitizeErrorCode(errorCode: SquadErrorCode): string {
    return SQUAD_ERROR_CODE_SET.has(errorCode) ? errorCode : "unknown";
  }

  private _sanitizePrimitive(value: SquadTelemetryPrimitive): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : undefined;
    }
    return this._sanitizeValue(value);
  }

  private _sanitizeValue(value: string): string {
    return SAFE_VALUE_PATTERN.test(value) ? value : "redacted";
  }

  private _sanitizeMeasurements(measurements: Record<string, number | undefined>): Record<string, number> {
    const sanitized: Record<string, number> = {};
    for (const [key, value] of Object.entries(measurements)) {
      if (!SAFE_MEASUREMENT_KEYS.has(key) || value === undefined || !Number.isFinite(value) || value < 0) {
        continue;
      }
      sanitized[key] = value;
    }
    return sanitized;
  }
}
