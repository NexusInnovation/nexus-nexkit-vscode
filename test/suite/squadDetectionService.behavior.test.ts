/**
 * Gap-filling behavior tests for SquadDetectionService (SQD-022).
 *
 * Complements the SQD-004 baseline suite (`squadDetectionService.test.ts`) by
 * covering the detection scenarios called out in issue #237: absent vs present
 * `.squad`, the (unsupported) legacy `.ai-team` fallback, empty roster files,
 * unreadable marker files, the `0.0.0-source` sentinel, malformed and CRLF
 * version stamps, version comparison edges, CLI resilience, multi-root
 * selection, and Windows-style workspace roots. Tests assert against the
 * public `detect()` contract and the injected I/O seams — never internals.
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
  SQUAD_SOURCE_VERSION,
  SquadCliSource,
  SquadInstallState,
  SquadVersionStatus,
  isSquadErr,
  isSquadOk,
  squadErr,
  squadOk,
} from "../../src/features/squad/models";

const ROOT = vscode.Uri.file("/tmp/workspace");

/** Silent logger stub so tests don't create output channels. */
const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
} as unknown as import("../../src/shared/services/loggingService").LoggingService;

/** Build an in-memory file reader from a relative-path -> content map. */
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

/** All three markers present, mapping to the given agent-file content. */
function allMarkers(agentContent: string): Record<string, string | true> {
  return {
    ".squad/config.json": "{}",
    ".squad/team.md": "roster",
    ".github/agents/squad.agent.md": agentContent,
  };
}

const cliMissing: SquadCliProbe = {
  async probeCli() {
    return squadErr({ code: "cli-not-found", message: "not found", remediation: "install it" });
  },
};

/** Probe fake that reports a version for a single source (default: global). */
function cliFound(version: string, source: SquadCliSource = SquadCliSource.Global): SquadCliProbe {
  return {
    async probeCli(options) {
      const requested = options?.source ?? SquadCliSource.Npx;
      if (requested === source) {
        return squadOk({ version, source });
      }
      return squadErr({ code: "cli-not-found", message: "not found", remediation: "install it" });
    },
  } as SquadCliProbe;
}

suite("Unit: SquadDetectionService — detection scenarios (SQD-022)", () => {
  suite("Marker presence (FR-001)", () => {
    test("Should report not-installed when .squad is absent entirely", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.installState, SquadInstallState.NotInstalled);
    });

    test("Should NOT treat a legacy .ai-team folder as a Squad marker", async () => {
      // There is no legacy `.ai-team` fallback: only the SQUAD_MARKER_FILES
      // count. This guards against silently claiming support for it later.
      const service = new SquadDetectionService({
        fileReader: fakeReader({
          ".ai-team/config.json": "{}",
          ".ai-team/team.md": "roster",
        }),
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

    test("Should report partial when only the agent marker is present", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({ ".github/agents/squad.agent.md": "<!-- version: 1.0.0 -->" }),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.installState, SquadInstallState.Partial);
      assert.strictEqual(result.value.project.markers[".github/agents/squad.agent.md"], true);
    });

    test("Should count an empty roster/config file as a present marker", async () => {
      // An empty team.md still exists on disk; presence is about existence,
      // not content.
      const service = new SquadDetectionService({
        fileReader: fakeReader({
          ".squad/config.json": "",
          ".squad/team.md": "",
        }),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.markers[".squad/team.md"], true);
      assert.strictEqual(result.value.project.markers[".squad/config.json"], true);
      assert.strictEqual(result.value.project.installState, SquadInstallState.Partial);
    });
  });

  suite("Project version stamp variants (FR-002)", () => {
    test("Should expose the source sentinel and stay unknown even with a latest version", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader(allMarkers(`<!-- version: ${SQUAD_SOURCE_VERSION} -->`)),
        cliService: cliMissing,
        logger: silentLogger,
        latestProjectVersion: "9.9.9",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.projectVersion, SQUAD_SOURCE_VERSION);
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.Unknown);
    });

    test("Should degrade a malformed stamp to unknown without failing detection", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader(allMarkers("<!-- version: banana -->")),
        cliService: cliMissing,
        logger: silentLogger,
        latestProjectVersion: "2.0.0",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      // Detection never fails on one bad field; install state still reflects markers.
      assert.strictEqual(result.value.project.installState, SquadInstallState.Installed);
      assert.strictEqual(result.value.project.projectVersion, null);
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.Unknown);
    });

    test("Should parse a CRLF-terminated stamp", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader(allMarkers("<!-- version: 4.5.6 -->\r\n# agent\r\n")),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.projectVersion, "4.5.6");
    });

    test("Should report up-to-date when the project version is newer than the latest known", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader(allMarkers("<!-- version: 2.0.0 -->")),
        cliService: cliMissing,
        logger: silentLogger,
        latestProjectVersion: "1.5.0",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.UpToDate);
    });

    test("Should stay unknown when the latest version is not comparable", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader(allMarkers("<!-- version: 1.0.0 -->")),
        cliService: cliMissing,
        logger: silentLogger,
        latestProjectVersion: "not-a-version",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.Unknown);
    });

    test("Should stay unknown when a present marker file cannot be read", async () => {
      // The agent marker exists, but reading it throws — detection degrades to
      // unknown rather than failing the whole snapshot.
      const reader: SquadFileReader = {
        async exists(): Promise<boolean> {
          return true;
        },
        async readFile(): Promise<string> {
          throw new Error("EACCES: permission denied");
        },
      };
      const service = new SquadDetectionService({
        fileReader: reader,
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.installState, SquadInstallState.Installed);
      assert.strictEqual(result.value.project.projectVersion, null);
      assert.strictEqual(result.value.project.versionStatus, SquadVersionStatus.Unknown);
    });
  });

  suite("CLI resilience (FR-003, FR-004)", () => {
    test("Should treat a CLI probe rejection as not installed", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: {
          async probeCli() {
            throw new Error("spawn failed");
          },
        },
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, false);
      assert.strictEqual(result.value.cli.versionStatus, SquadVersionStatus.Unknown);
    });

    test("Should keep probing later locations after an earlier source times out", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: {
          async probeCli(options) {
            const source = options?.source ?? SquadCliSource.Npx;
            if (source === SquadCliSource.Custom) {
              return squadErr({ code: "cli-timeout", message: "timed out", remediation: "retry" });
            }
            if (source === SquadCliSource.Global) {
              return squadOk({ version: "5.6.7", source: SquadCliSource.Global });
            }
            return squadErr({ code: "cli-not-found", message: "not found", remediation: "install it" });
          },
        },
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, true);
      assert.strictEqual(result.value.cli.cliVersion, "5.6.7");
    });

    test("Should surface a prerelease CLI version token", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliFound("3.2.1-beta.2", SquadCliSource.Global),
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.cliVersion, "3.2.1-beta.2");
    });

    test("Should report not installed when the probe cannot determine a version", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: {
          async probeCli() {
            return squadErr({ code: "version-unknown", message: "unknown", remediation: "upgrade" });
          },
        },
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.installed, false);
      assert.strictEqual(result.value.cli.cliVersion, null);
    });

    test("Should flag an update-available CLI against a newer published version", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliFound("1.0.0", SquadCliSource.Global),
        logger: silentLogger,
        latestCliVersion: "1.2.0",
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.versionStatus, SquadVersionStatus.UpdateAvailable);
    });
  });

  suite("Workspace roots & paths", () => {
    test("Should resolve markers relative to an explicit root (multi-root)", async () => {
      const rootA = vscode.Uri.file("/tmp/projects/alpha");
      const rootB = vscode.Uri.file("/tmp/projects/beta");
      // Only rootA carries Squad markers; rootB does not.
      const reader: SquadFileReader = {
        async exists(uri: vscode.Uri): Promise<boolean> {
          return (
            uri.path.startsWith(rootA.path) &&
            SQUAD_MARKER_FILES.some((m) => uri.path.endsWith(m))
          );
        },
        async readFile(uri: vscode.Uri): Promise<string> {
          if (uri.path.startsWith(rootA.path)) {
            return "<!-- version: 1.0.0 -->";
          }
          throw new Error("ENOENT");
        },
      };
      const service = new SquadDetectionService({
        fileReader: reader,
        cliService: cliMissing,
        logger: silentLogger,
      });

      const inAlpha = await service.detect(rootA);
      const inBeta = await service.detect(rootB);

      assert.ok(isSquadOk(inAlpha));
      assert.strictEqual(inAlpha.value.project.installState, SquadInstallState.Installed);
      assert.ok(isSquadOk(inBeta));
      assert.strictEqual(inBeta.value.project.installState, SquadInstallState.NotInstalled);
    });

    test("Should detect markers under a Windows-style workspace root", async () => {
      const winRoot = vscode.Uri.file("C:\\Users\\dev\\my-project");
      const service = new SquadDetectionService({
        fileReader: fakeReader(allMarkers("<!-- version: 7.8.9 -->")),
        cliService: cliMissing,
        logger: silentLogger,
      });

      const result = await service.detect(winRoot);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.project.installState, SquadInstallState.Installed);
      assert.strictEqual(result.value.project.projectVersion, "7.8.9");
    });

    test("Should fail with not-a-workspace when no root is available", async () => {
      const originalFolders = vscode.workspace.workspaceFolders;
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: undefined,
        configurable: true,
      });
      try {
        const service = new SquadDetectionService({
          fileReader: fakeReader({}),
          cliService: cliMissing,
          logger: silentLogger,
        });

        const result = await service.detect(undefined);

        assert.ok(isSquadErr(result));
        if (isSquadErr(result)) {
          assert.strictEqual(result.error.code, "not-a-workspace");
          assert.ok(result.error.remediation && result.error.remediation.length > 0);
        }
      } finally {
        Object.defineProperty(vscode.workspace, "workspaceFolders", {
          value: originalFolders,
          configurable: true,
        });
      }
    });
  });

  suite("CLI source reporting (FR-004)", () => {
    test("Should report the global source when no custom path is configured", async () => {
      const service = new SquadDetectionService({
        fileReader: fakeReader({}),
        cliService: cliFound("1.0.0", SquadCliSource.Global),
        logger: silentLogger,
      });

      const result = await service.detect(ROOT);

      assert.ok(isSquadOk(result));
      assert.strictEqual(result.value.cli.source, SquadCliSource.Global);
    });
  });
});
