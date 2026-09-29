/**
 * Rendering + fixture helpers for the Preact Squad webview tests.
 *
 * Two render strategies are offered:
 *
 *  - {@link renderWithAppState} wraps the UI in an `AppStateContext.Provider`
 *    with a caller-supplied state slice — ideal for purely presentational
 *    component tests that need a specific Squad state without message plumbing.
 *  - {@link renderWithProvider} uses the real {@link AppStateProvider}, so its
 *    centralized message handling can be exercised end-to-end by dispatching
 *    extension messages through the {@link dispatchExtensionMessage} helper.
 *
 * Model fixtures ({@link makeDetection}, {@link makePreset}, …) build valid
 * SQD-001 domain objects with sensible defaults so each test overrides only the
 * fields it cares about.
 */

import { render } from "@testing-library/preact";
import type { ComponentChildren, VNode } from "preact";
import { AppStateContext, AppStateProvider } from "../../../../src/features/panel-ui/webview/contexts/AppStateContext";
import type { AppState } from "../../../../src/features/panel-ui/webview/types/appState";
import { initialAppState } from "../../../../src/features/panel-ui/webview/types/appState";
import type { SquadState, SquadPresetPickerState } from "../../../../src/features/panel-ui/webview/types/squadState";
import { initialSquadState, initialSquadPresetPickerState } from "../../../../src/features/panel-ui/webview/types/squadState";
import {
  SquadCliSource,
  SquadInstallState,
  SquadVersionStatus,
  SquadDoctorSeverity,
  SquadPresetSourceKind,
} from "../../../../src/features/squad/models";
import type {
  SquadCliInfo,
  SquadDetectionResult,
  SquadDoctorReport,
  SquadError,
  SquadPreset,
  SquadProjectInfo,
  RejectedSquadPreset,
  UnreachableSquadSource,
} from "../../../../src/features/squad/models";

export { render, fireEvent, act, waitFor, cleanup, within } from "@testing-library/preact";

/** Squad-state overrides where the preset-picker slice may itself be partial. */
export type SquadStateOverrides = Partial<Omit<SquadState, "presetPicker">> & {
  presetPicker?: Partial<SquadPresetPickerState>;
};

/** Build a full {@link SquadState} from a partial override. */
export function makeSquadState(overrides: SquadStateOverrides = {}): SquadState {
  const { presetPicker, ...rest } = overrides;
  return {
    ...initialSquadState,
    ...rest,
    presetPicker: makePresetPickerState(presetPicker),
  };
}

/** Build a full {@link SquadPresetPickerState} from a partial override. */
export function makePresetPickerState(overrides: Partial<SquadPresetPickerState> = {}): SquadPresetPickerState {
  return { ...initialSquadPresetPickerState, ...overrides };
}

/** Build a full {@link AppState} whose Squad slice is overridden. */
export function makeAppState(squad: SquadStateOverrides = {}): AppState {
  return { ...initialAppState, squad: makeSquadState(squad) };
}

/**
 * Render {@link ui} inside an `AppStateContext.Provider` seeded with a Squad
 * state slice. The VS Code messenger singleton (mocked globally) is still used
 * for action dispatch, so posted messages can be asserted.
 */
export function renderWithAppState(ui: VNode, squad: SquadStateOverrides = {}) {
  return render(<AppStateContext.Provider value={makeAppState(squad)}>{ui}</AppStateContext.Provider>);
}

/** Render {@link children} inside the real {@link AppStateProvider}. */
export function renderWithProvider(children: ComponentChildren) {
  return render(<AppStateProvider>{children}</AppStateProvider>);
}

/** A healthy project-detection block (Squad installed). */
export function makeProjectInfo(overrides: Partial<SquadProjectInfo> = {}): SquadProjectInfo {
  return {
    installState: SquadInstallState.Installed,
    markers: {
      ".squad/config.json": true,
      ".squad/team.md": true,
      ".github/agents/squad.agent.md": true,
    },
    projectVersion: "1.2.3",
    versionStatus: SquadVersionStatus.UpToDate,
    ...overrides,
  };
}

/** A CLI-availability block (installed via a global install by default). */
export function makeCliInfo(overrides: Partial<SquadCliInfo> = {}): SquadCliInfo {
  return {
    installed: true,
    source: SquadCliSource.Global,
    cliVersion: "0.13.0",
    versionStatus: SquadVersionStatus.UpToDate,
    ...overrides,
  };
}

/** A full detection snapshot. */
export function makeDetection(overrides: Partial<SquadDetectionResult> = {}): SquadDetectionResult {
  return {
    project: makeProjectInfo(),
    cli: makeCliInfo(),
    detectedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/** A structured, actionable Squad error. */
export function makeError(overrides: Partial<SquadError> = {}): SquadError {
  return {
    code: "detection-failed",
    message: "Squad detection failed.",
    remediation: "Open a workspace folder and try again.",
    ...overrides,
  };
}

/** A valid, selectable preset. */
export function makePreset(id: string, overrides: Partial<SquadPreset> = {}): SquadPreset {
  return {
    id,
    name: `Preset ${id}`,
    description: `Description for ${id}`,
    version: "1.0.0",
    source: {
      kind: SquadPresetSourceKind.Marketplace,
      pluginId: id,
      squadFolderPath: `plugins/${id}/squad`,
    },
    ...overrides,
  };
}

/** A rejected preset carrying blocking diagnostics. */
export function makeRejectedPreset(
  pluginId: string,
  kind: SquadPresetSourceKind = SquadPresetSourceKind.ExternalRepo,
  overrides: Partial<RejectedSquadPreset> = {}
): RejectedSquadPreset {
  return {
    pluginId,
    source: {
      kind,
      pluginId,
      squadFolderPath: `plugins/${pluginId}/squad`,
    },
    diagnostics: [
      {
        code: "manifest-missing",
        severity: "error",
        message: "manifest.json is missing.",
        path: "manifest.json",
        remediation: "Add a manifest.json at the root of the squad/ folder.",
      },
    ],
    ...overrides,
  };
}

/** A source that could not be reached. */
export function makeUnreachableSource(
  sourceId: string,
  overrides: Partial<UnreachableSquadSource> = {}
): UnreachableSquadSource {
  return {
    sourceId,
    label: `Source ${sourceId}`,
    error: makeError({ code: "preset-fetch-failed", message: `Could not reach ${sourceId}.` }),
    ...overrides,
  };
}

/** A Squad Doctor report. */
export function makeDoctorReport(overrides: Partial<SquadDoctorReport> = {}): SquadDoctorReport {
  return {
    overall: SquadDoctorSeverity.Ok,
    checks: [{ label: "Workspace", severity: SquadDoctorSeverity.Ok }],
    structured: true,
    generatedAt: 1_700_000_000_000,
    ...overrides,
  };
}
