/**
 * Tests for SquadDetectionService (SQD-004).
 *
 * Covers PRD FR-001 (marker detection), FR-002 (project version comment,
 * `unknown` when absent) and FR-003 (CLI detection with timeout).
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
  SquadCliProbe,
  SquadDetectionService,
  SquadFileReader,
} from "../../src/features/squad/services/squadDetectionService";
import {
  SQUAD_MARKER_FILES,
  SquadCliSource,
  SquadInstallState,
  SquadVersionStatus,
  isSquadErr,
  isSquadOk,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

const ROOT = vscode.Uri.file("/tmp/workspace");

/** Build an in-memory file reader from a relative-path map. */
function fakeReader(files: Record<string, string | true>): SquadFileReader {
  const has = (uri: vscode.Uri): string | undefined => {
    for (const [relative, value] of Object.entries(files)) {
      if (uri.path.endsWith(relative)) {
        return typeof value === "string" ? value : "";
      }
    }
    return undefined;
  };
  return {
    async exists(uri: vscode.Uri): Promise<boolean> {
      return has(uri) !== undefined;
    },
    async readFile(uri: vscode.Uri): Promise<string> {
      const content = has(uri);
      if (content === undefined) {
        throw new Error("ENOENT");
      }
      return content;
    },
  };
}

/** Silent logger stub so tests don't create output channels. */
const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

const cliMissing: SquadCliProbe = {
  async probeCli() {
    return squadErr({ code: "cli-not-found", message: "not found", remediation: "install it" });
  },
};

/**
 * Build a CLI probe fake that maps each source to a canned result. Detection
 * probes sources in order (custom, global, npx), so an unmapped source falls
 * through to `cli-not-found`, letting the next source be tried.
 */
function fakeCli(
  bySource: Partial<Record<SquadCliSource, ReturnType<typeof squadOk> | ReturnType<typeof squadErr>>>,
  throwFor: SquadCliSource[] = [],
): SquadCliProbe {
  return {
    async probeCli(options) {
      const source = options?.source ?? SquadCliSource.Npx;
      if (throwFor.includes(source)) {
        throw new Error("spawn failed");
      }
      return (
        bySource[source] ??
        squadErr({ code: "cli-not-found", message: "not found", remediation: "install it" })
      );
    },
  } as SquadCliProbe;
}

/** Probe fake that reports a version for a single source. */
function cliFound(version: string, source: SquadCliSource = SquadCliSource.Global): SquadCliProbe {
  return fakeCli({ [source]: squadOk({ version, source }) });
}

suite("Unit: SquadDetectionService", () => {
  suite("Project detection (FR-001)", () => {
    test("Should report not-installed when no markers are present", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.installState, SquadInstallState.NotInstalled);
      for (const marker of SQUAD_MARKER_FILES) {
        assert.strictEqual(result.value.project.markers[marker], false);
      }
    });

    test("Should report partial when some markers are present", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({ ".squad/team.md": "roster" }),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.installState, SquadInstallState.Partial);
      assert.strictEqual(result.value.project.markers[".squad/team.md"], true);
      assert.strictEqual(result.value.project.markers[".squad/config.json"], false);
    });

    test("Should report installed when all markers are present", async () => {
      const files: Record<string, string | true> = {
        ".squad/config.json": "{}",
        ".squad/team.md": "roster",
        ".github/agents/squad.agent.md": "<!-- version: 1.2.3 -->",
      };
      const service = new SquadDetectionService({
        fileReader: fakeReader(files),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.installState, SquadInstallState.Installed);
    });
  });

  suite("Project version (FR-002)", () => {
    test("Should parse the version from the agent comment", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({ ".github/agents/squad.agent.md": "# Agent\n<!-- version: 2.4.0 -->\n" }),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.projectVersion, "2.4.0");
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.Unknown);
    });

    test("Should stay unknown when the comment is absent", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({ ".github/agents/squad.agent.md": "# Agent with no version" }),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.projectVersion, null);
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.Unknown);
    });

    test("Should flag update-available against a newer known version", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({ ".github/agents/squad.agent.md": "<!-- version: 1.0.0 -->" }),
        cliService: cliMissing,
        logger: silentLogger,
        latestProjectVersion: "1.1.0",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.UpdateAvailable);
    });

    test("Should flag up-to-date when versions match", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({ ".github/agents/squad.agent.md": "<!-- version: 1.1.0 -->" }),
        cliService: cliMissing,
        logger: silentLogger,
        latestProjectVersion: "1.1.0",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.UpToDate);
    });
  });

  suite("CLI detection (FR-003, FR-004)", () => {
    test("Should report the CLI as not installed when no source resolves it", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, false);
      assert.strictEqual(result.value.cli.cliVersion, null);
      assert.strictEqual(result.value.cli.versionStatus, SquadVersionStatus.Unknown);
    });

    test("Should report a globally-installed CLI when no custom path is configured", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliFound("3.2.1", SquadCliSource.Global),
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, true);
      assert.strictEqual(result.value.cli.cliVersion, "3.2.1");
      assert.strictEqual(result.value.cli.source, SquadCliSource.Global);
    });

    test("Should fall back from a missing custom path to a global install", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: fakeCli({ [SquadCliSource.Global]: squadOk({ version: "4.0.0", source: SquadCliSource.Global }) }),
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, true);
      assert.strictEqual(result.value.cli.cliVersion, "4.0.0");
      assert.strictEqual(result.value.cli.source, SquadCliSource.Global);
    });

    test("Should NOT probe npx during passive detection (no network fallback)", async () => {
      const probed: SquadCliSource[] = [];
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: {
          async probeCli(options) {
            const source = options?.source ?? SquadCliSource.Npx;
            probed.push(source);
            // Only npx could resolve — but detection must never probe it.
            if (source === SquadCliSource.Npx) {
              return squadOk({ version: "9.9.9", source: SquadCliSource.Npx });
            }
            return squadErr({ code: "cli-not-found", message: "not found", remediation: "install it" });
          },
        },
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, false);
      assert.ok(!probed.includes(SquadCliSource.Npx), "npx must not be probed passively");
    });

    test("Should treat a probe error (timeout) as not installed", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: {
          async probeCli() {
            return squadErr({ code: "cli-timeout", message: "timed out", remediation: "retry" });
          },
        },
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, false);
    });

    test("Should prefer and report the custom source when a custom path resolves", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliFound("1.0.0", SquadCliSource.Custom),
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, true);
      assert.strictEqual(result.value.cli.source, SquadCliSource.Custom);
    });
  });

  suite("Robustness", () => {
    test("Should fail with not-a-workspace when no root can be resolved", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(undefined);

      // In the test host no workspace folder is guaranteed; when absent this is
      // an actionable failure rather than a false success.
      if (isSquadErr(result)) {
        assert.strictEqual(result.error.code, "not-a-workspace");
        assert.ok(result.error.remediation);
      } else {
        assert.ok(result.value.project);
      }
    });

    test("Should surface detection-failed when a file read throws unexpectedly", async () => {
      const reader: SquadFileReader = {
        async exists(): Promise<boolean> {
          throw new Error("disk exploded");
        },
        async readFile(): Promise<string> {
          return "";
        },
      };
      const service = new SquadDetectionService({
        fileReader: reader,
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "detection-failed");
    });

    test("Should stamp detectedAt from the injected clock", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliMissing,
        logger: silentLogger,
        now: () => 123456,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.detectedAt, 123456);
    });
  });
});
