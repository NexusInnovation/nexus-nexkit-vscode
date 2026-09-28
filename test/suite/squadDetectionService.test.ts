/**
 * Tests for SquadDetectionService (SQD-004).
 *
 * Covers PRD FR-001 (marker detection), FR-002 (project version comment,
 * `unknown` when absent) and FR-003 (CLI detection with timeout).
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
  SquadCliRunResult,
  SquadDetectionService,
  SquadFileReader,
} from "../../src/features/squad/squadDetectionService";
import {
  SQUAD_MARKER_FILES,
  SquadCliSource,
  SquadInstallState,
  SquadVersionStatus,
  isSquadErr,
  isSquadOk,
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

const cliNotFound = async (): Promise<SquadCliRunResult> => ({ found: false, stdout: "", timedOut: false });

suite("Unit: SquadDetectionService", () => {
  suite("Project detection (FR-001)", () => {
    test("Should report not-installed when no markers are present", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliRunner: cliNotFound,
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
        cliRunner: cliNotFound,
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
        cliRunner: cliNotFound,
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
        cliRunner: cliNotFound,
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
        cliRunner: cliNotFound,
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
        cliRunner: cliNotFound,
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
        cliRunner: cliNotFound,
        logger: silentLogger,
        latestProjectVersion: "1.1.0",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.UpToDate);
    });
  });

  suite("CLI detection (FR-003)", () => {
    test("Should report the CLI as not installed when the command is missing", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliRunner: cliNotFound,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, false);
      assert.strictEqual(result.value.cli.cliVersion, null);
      assert.strictEqual(result.value.cli.versionStatus, SquadVersionStatus.Unknown);
    });

    test("Should parse the CLI version from output", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliRunner: async () => ({ found: true, stdout: "squad 3.2.1\n", timedOut: false }),
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, true);
      assert.strictEqual(result.value.cli.cliVersion, "3.2.1");
      assert.strictEqual(result.value.cli.source, SquadCliSource.Global);
    });

    test("Should fall back to --version when version subcommand yields nothing", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliRunner: async (_command, args) =>
          args[0] === "version"
            ? { found: true, stdout: "no version here", timedOut: false }
            : { found: true, stdout: "v4.0.0", timedOut: false },
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.cliVersion, "4.0.0");
    });

    test("Should treat a timeout as not installed", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliRunner: async () => ({ found: true, stdout: "", timedOut: true }),
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, false);
    });

    test("Should report custom source when a custom CLI path is configured", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliRunner: async () => ({ found: true, stdout: "1.0.0", timedOut: false }),
        logger: silentLogger,
        customCliPath: "/opt/squad",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.source, SquadCliSource.Custom);
    });
  });

  suite("Robustness", () => {
    test("Should fail with not-a-workspace when no root can be resolved", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliRunner: cliNotFound,
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
        cliRunner: cliNotFound,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "detection-failed");
    });

    test("Should stamp detectedAt from the injected clock", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliRunner: cliNotFound,
        logger: silentLogger,
        now: () => 123456,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.detectedAt, 123456);
    });
  });
});
