/**
 * SQD-041 (#256) — Squad CLI command paths against a simulated CLI.
 *
 * Drives the real, allowlisted {@link SquadCliService} through the shared
 * {@link FakeSquadCli} (no process, no network) for every allowlisted command:
 * success, failure, timeout, missing CLI, cancellation and non-allowed
 * commands/arguments. Covers PRD FR-005 (upgrade commands), FR-031/FR-032
 * (upstream), FR-044 (plugin) at the CLI boundary.
 *
 * The allowlist contract is pinned so widening it (a new command or flag)
 * fails here and forces a deliberate security review.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { SquadCliSource, type SquadError, type SquadResult } from "../../src/features/squad/models";
import {
  SQUAD_CLI_COMMAND_SPECS,
  SQUAD_CLI_TIMEOUTS_MS,
  SquadCliCommand,
} from "../../src/features/squad/services/squadCliService";
import {
  FAKE_SQUAD_UNEXPECTED_EXIT_CODE,
  FakeSquadCli,
  fakeSquadReply,
  squadArgsOf,
} from "./helpers/fakeSquadCli";

const WORKSPACE = vscode.Uri.file(process.platform === "win32" ? "C:\\work\\repo" : "/work/repo");

const ALL_COMMANDS = Object.values(SquadCliCommand);

/** Commands allowed in {@link SquadCliService.execute} (excludes long-running commands). */
const EXECUTABLE_COMMANDS = ALL_COMMANDS.filter((cmd) => !SQUAD_CLI_COMMAND_SPECS[cmd].longRunning);

/** Assert a failed result and return its error for further checks. */
function expectErr<T>(result: SquadResult<T>, code: SquadError["code"]): SquadError {
  assert.strictEqual(result.ok, false, "a failure must never be reported as success");
  if (result.ok) {
    throw new Error("unreachable");
  }
  assert.strictEqual(result.error.code, code, `unexpected error: ${result.error.message}`);
  assert.ok(result.error.message.trim().length > 0, "error message must be visible");
  assert.ok(result.error.remediation && result.error.remediation.trim().length > 0, "error must be actionable");
  return result.error;
}

suite("Unit: Squad CLI simulated commands (SQD-041)", () => {
  suite("FakeSquadCli helper", () => {
    test("strips the npx launcher prefix so routes match the Squad argv", async () => {
      const fake = new FakeSquadCli().on(["version"], fakeSquadReply.ok("1.2.3"));
      const cli = fake.createService({ cliSource: SquadCliSource.Npx });

      const result = await cli.execute(SquadCliCommand.Version);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(fake.lastCall?.request.command, "npx");
      assert.deepStrictEqual(fake.lastCall?.request.args, ["--yes", "@bradygaster/squad-cli", "version"]);
      assert.deepStrictEqual(fake.lastCall?.squadArgs, ["version"]);
    });

    test("does not strip arguments for non-npx launchers", () => {
      assert.deepStrictEqual(
        squadArgsOf({ command: "/opt/squad", args: ["--yes", "@bradygaster/squad-cli", "version"], timeoutMs: 1 }),
        ["--yes", "@bradygaster/squad-cli", "version"]
      );
    });

    test("an unscripted command fails and is recorded, never a silent success", async () => {
      const fake = new FakeSquadCli();
      const cli = fake.createService();

      const result = await cli.execute(SquadCliCommand.Doctor);

      const error = expectErr(result, "cli-execution-failed");
      assert.strictEqual(error.detail, `exitCode=${FAKE_SQUAD_UNEXPECTED_EXIT_CODE}`);
      assert.strictEqual(fake.unexpectedCalls.length, 1);
      assert.deepStrictEqual(fake.unexpectedCalls[0].squadArgs, ["doctor"]);
    });

    test("later routes override earlier ones and once() routes are consumed", async () => {
      const fake = new FakeSquadCli()
        .on(["upstream"], fakeSquadReply.fail(1, "generic"))
        .on(["upstream", "sync"], fakeSquadReply.ok("synced"))
        .once(["upstream", "sync"], fakeSquadReply.fail(2, "first sync fails"));
      const cli = fake.createService();

      const first = await cli.execute(SquadCliCommand.Upstream, { args: ["sync"] });
      const second = await cli.execute(SquadCliCommand.Upstream, { args: ["sync"] });
      const other = await cli.execute(SquadCliCommand.Upstream, { args: ["list"] });

      assert.strictEqual(expectErr(first, "cli-execution-failed").detail, "exitCode=2");
      assert.strictEqual(second.ok, true);
      assert.strictEqual(expectErr(other, "cli-execution-failed").detail, "exitCode=1");
      assert.strictEqual(fake.unexpectedCalls.length, 0);
    });
  });

  suite("allowlist contract", () => {
    test("exposes exactly the reviewed command set", () => {
      assert.deepStrictEqual(
        EXECUTABLE_COMMANDS.map((cmd) => cmd.valueOf()).sort(),
        [
          "consult",
          "doctor",
          "export",
          "extract",
          "import",
          "init",
          "plugin",
          "upgrade",
          "upgrade-self",
          "upstream",
          "version",
        ]
      );
    });

    test("pins the argv, flags, operand policy and default timeout of every command", () => {
      const snapshot = Object.fromEntries(
        EXECUTABLE_COMMANDS.map((command) => {
          const spec = SQUAD_CLI_COMMAND_SPECS[command];
          return [
            command,
            {
              argv: [...spec.argv],
              flags: [...spec.allowedFlags].sort(),
              operands: spec.allowsOperands,
              timeout: spec.defaultTimeoutMs,
            },
          ];
        })
      );

      assert.deepStrictEqual(snapshot, {
        version: { argv: ["version"], flags: [], operands: false, timeout: SQUAD_CLI_TIMEOUTS_MS.version },
        doctor: { argv: ["doctor"], flags: ["--json"], operands: false, timeout: SQUAD_CLI_TIMEOUTS_MS.doctor },
        init: {
          argv: ["init"],
          flags: ["--force", "--global", "--preset", "--yes"],
          operands: true,
          timeout: SQUAD_CLI_TIMEOUTS_MS.init,
        },
        upgrade: { argv: ["upgrade"], flags: ["--force", "--yes"], operands: false, timeout: SQUAD_CLI_TIMEOUTS_MS.upgrade },
        "upgrade-self": {
          argv: ["upgrade", "--self"],
          flags: ["--yes"],
          operands: false,
          timeout: SQUAD_CLI_TIMEOUTS_MS.upgrade,
        },
        upstream: {
          argv: ["upstream"],
          flags: ["--name", "--ref", "--yes"],
          operands: true,
          timeout: SQUAD_CLI_TIMEOUTS_MS.standard,
        },
        plugin: {
          argv: ["plugin"],
          flags: ["--json", "--yes"],
          operands: true,
          timeout: SQUAD_CLI_TIMEOUTS_MS.standard,
        },
        export: {
          argv: ["export"],
          flags: ["--force", "--output", "--path", "--ref"],
          operands: true,
          timeout: SQUAD_CLI_TIMEOUTS_MS.standard,
        },
        import: { argv: ["import"], flags: ["--yes"], operands: true, timeout: SQUAD_CLI_TIMEOUTS_MS.standard },
        consult: { argv: ["consult"], flags: ["--yes"], operands: false, timeout: SQUAD_CLI_TIMEOUTS_MS.standard },
        extract: { argv: ["extract"], flags: ["--yes"], operands: false, timeout: SQUAD_CLI_TIMEOUTS_MS.standard },
      });
    });
  });

  suite("success path — every allowlisted command", () => {
    for (const command of EXECUTABLE_COMMANDS) {
      test(`\`${command}\` runs the pinned argv with its default timeout and returns the output`, async () => {
        const spec = SQUAD_CLI_COMMAND_SPECS[command];
        const fake = new FakeSquadCli().on(spec.argv, fakeSquadReply.ok(`${command} done`, "a warning"));
        const cli = fake.createService();

        const result = await cli.execute(command, { cwd: WORKSPACE });

        assert.strictEqual(result.ok, true);
        if (result.ok) {
          assert.strictEqual(result.value.command, command);
          assert.strictEqual(result.value.exitCode, 0);
          assert.strictEqual(result.value.stdout, `${command} done`);
          assert.strictEqual(result.value.stderr, "a warning");
        }
        assert.strictEqual(fake.spawnCount, 1);
        assert.strictEqual(fake.lastCall?.request.command, "squad");
        assert.deepStrictEqual(fake.lastCall?.squadArgs, [...spec.argv]);
        assert.strictEqual(fake.lastCall?.request.timeoutMs, spec.defaultTimeoutMs);
        assert.strictEqual(fake.lastCall?.request.cwd, WORKSPACE.fsPath);
      });
    }

    test("appends validated flags (including --flag=value) and operands after the fixed argv", async () => {
      const fake = new FakeSquadCli().on([], fakeSquadReply.ok());
      const cli = fake.createService();

      await cli.execute(SquadCliCommand.Init, { args: ["--preset=nexus", "--yes", "my-team"] });
      await cli.execute(SquadCliCommand.Upstream, { args: ["add", "org/repo", "--name", "org", "--ref", "v1"] });
      await cli.execute(SquadCliCommand.UpgradeSelf, { args: ["--yes"] });

      assert.deepStrictEqual(
        fake.calls.map((c) => c.squadArgs),
        [
          ["init", "--preset=nexus", "--yes", "my-team"],
          ["upstream", "add", "org/repo", "--name", "org", "--ref", "v1"],
          ["upgrade", "--self", "--yes"],
        ]
      );
    });

    test("honours a caller timeout override", async () => {
      const fake = new FakeSquadCli().on([], fakeSquadReply.ok());
      await fake.createService().execute(SquadCliCommand.Upstream, { args: ["sync"], timeoutMs: 300_000 });

      assert.strictEqual(fake.lastCall?.request.timeoutMs, 300_000);
    });
  });

  suite("failure path — non-zero exit", () => {
    for (const command of EXECUTABLE_COMMANDS) {
      test(`\`${command}\` exiting non-zero is an actionable cli-execution-failed`, async () => {
        const fake = new FakeSquadCli().on([], fakeSquadReply.fail(3, "\n  \n  Error: boom happened\nstack…", "partial"));

        const result = await fake.createService().execute(command);

        const error = expectErr(result, "cli-execution-failed");
        assert.ok(error.message.includes("boom happened"), "first stderr line is surfaced");
        assert.ok(!error.message.includes("stack"), "only the first stderr line is surfaced");
        assert.strictEqual(error.detail, "exitCode=3");
      });
    }

    test("a long stderr line is truncated for the user message", async () => {
      const fake = new FakeSquadCli().on([], fakeSquadReply.fail(1, "x".repeat(500)));

      const error = expectErr(await fake.createService().execute(SquadCliCommand.Doctor), "cli-execution-failed");

      assert.ok(error.message.length < 300);
      assert.ok(error.message.includes("..."));
    });

    test("a failure without stderr still reports a visible message", async () => {
      const fake = new FakeSquadCli().on([], fakeSquadReply.fail(1));

      const error = expectErr(await fake.createService().execute(SquadCliCommand.Upgrade), "cli-execution-failed");

      assert.ok(error.message.includes("upgrade"));
    });

    test("a runner crash is reported as a failure, not thrown or swallowed", async () => {
      const fake = new FakeSquadCli().on([], () => {
        throw new Error("EPIPE");
      });

      const error = expectErr(await fake.createService().execute(SquadCliCommand.Plugin), "cli-execution-failed");

      assert.ok(error.cause instanceof Error);
    });

    test("runDoctor re-maps a non-zero exit to doctor-failed", async () => {
      const fake = new FakeSquadCli().on(["doctor"], fakeSquadReply.fail(1, "config broken"));

      const result = await fake.createService().runDoctor({ cwd: WORKSPACE });

      expectErr(result, "doctor-failed");
      assert.deepStrictEqual(fake.lastCall?.squadArgs, ["doctor", "--json"]);
    });
  });

  suite("timeout path", () => {
    for (const command of EXECUTABLE_COMMANDS) {
      test(`\`${command}\` timing out is cli-timeout with the applied timeout`, async () => {
        const fake = new FakeSquadCli().on([], fakeSquadReply.timeout("half"));

        const error = expectErr(await fake.createService().execute(command), "cli-timeout");

        assert.strictEqual(error.detail, `timeoutMs=${SQUAD_CLI_COMMAND_SPECS[command].defaultTimeoutMs}`);
      });
    }

    test("a hung process is killed by the timeout and reported as cli-timeout", async () => {
      const fake = new FakeSquadCli().on(["upgrade"], fakeSquadReply.hang());

      const result = await fake.createService().execute(SquadCliCommand.Upgrade, { timeoutMs: 15 });

      assert.strictEqual(expectErr(result, "cli-timeout").detail, "timeoutMs=15");
      assert.strictEqual(fake.lastCall?.request.timeoutMs, 15);
    });

    test("a timed-out process is never success, even if an exit code of 0 is reported", async () => {
      const fake = new FakeSquadCli().on([], { exitCode: 0, timedOut: true, stdout: "done" });

      expectErr(await fake.createService().execute(SquadCliCommand.Upgrade), "cli-timeout");
    });

    test("runDoctor surfaces a timeout unchanged (not as doctor-failed)", async () => {
      const fake = new FakeSquadCli().on(["doctor"], fakeSquadReply.timeout());

      expectErr(await fake.createService().runDoctor(), "cli-timeout");
    });
  });

  suite("missing CLI path", () => {
    const cases: Array<{ source: SquadCliSource; hint: RegExp }> = [
      { source: SquadCliSource.Global, hint: /npm install -g @bradygaster\/squad-cli/ },
      { source: SquadCliSource.Npx, hint: /npx/ },
      { source: SquadCliSource.Custom, hint: /nexkit\.squad\.cliPath/ },
    ];

    for (const { source, hint } of cases) {
      test(`an unspawnable ${source} CLI is cli-not-found with source-specific remediation`, async () => {
        const fake = new FakeSquadCli().on([], fakeSquadReply.notFound("ENOENT"));
        const cli = fake.createService({ cliSource: source, customCliPath: "/opt/squad/bin/squad" });

        const error = expectErr(await cli.execute(SquadCliCommand.Upstream, { args: ["list"] }), "cli-not-found");

        assert.match(error.remediation ?? "", hint);
        assert.strictEqual(error.detail, `source=${source} code=ENOENT`);
      });
    }

    test("an empty custom CLI path fails before anything is spawned", async () => {
      const fake = new FakeSquadCli().on([], fakeSquadReply.ok());
      const cli = fake.createService({ cliSource: SquadCliSource.Custom, customCliPath: "  " });

      expectErr(await cli.execute(SquadCliCommand.Version), "cli-not-found");
      assert.strictEqual(fake.spawnCount, 0);
    });
  });

  suite("cancellation path", () => {
    test("cancelling a running command kills it and reports cancelled", async () => {
      const fake = new FakeSquadCli().on(["upstream", "sync"], fakeSquadReply.hang());
      const source = new vscode.CancellationTokenSource();

      const pending = fake.createService().execute(SquadCliCommand.Upstream, {
        args: ["sync"],
        token: source.token,
        timeoutMs: 10_000,
      });
      setTimeout(() => source.cancel(), 5);

      expectErr(await pending, "cancelled");
      source.dispose();
    });

    test("an already-cancelled token spawns nothing", async () => {
      const fake = new FakeSquadCli().on([], fakeSquadReply.ok());
      const source = new vscode.CancellationTokenSource();
      source.cancel();

      expectErr(await fake.createService().execute(SquadCliCommand.Plugin, { args: ["list"], token: source.token }), "cancelled");
      assert.strictEqual(fake.spawnCount, 0);
      source.dispose();
    });

    test("a cancelled process is never success, even if an exit code of 0 is reported", async () => {
      const fake = new FakeSquadCli().on([], { exitCode: 0, cancelled: true });

      expectErr(await fake.createService().execute(SquadCliCommand.Import), "cancelled");
    });
  });

  suite("non-allowed commands and arguments (never spawned)", () => {
    const rejected: Array<{ name: string; command: SquadCliCommand; args: string[] }> = [
      { name: "unknown flag on version", command: SquadCliCommand.Version, args: ["--json"] },
      { name: "operand on version", command: SquadCliCommand.Version, args: ["extra"] },
      { name: "shell payload on version", command: SquadCliCommand.Version, args: ["; rm -rf /"] },
      { name: "operand on doctor", command: SquadCliCommand.Doctor, args: ["--json", "all"] },
      { name: "--self escalation on project upgrade", command: SquadCliCommand.Upgrade, args: ["--self"] },
      { name: "operand on project upgrade", command: SquadCliCommand.Upgrade, args: ["latest"] },
      { name: "--registry on upgrade --self", command: SquadCliCommand.UpgradeSelf, args: ["--registry=https://evil"] },
      { name: "operand on upgrade --self", command: SquadCliCommand.UpgradeSelf, args: ["@evil/pkg"] },
      { name: "git option smuggling on upstream", command: SquadCliCommand.Upstream, args: ["add", "--upload-pack=touch x"] },
      { name: "short flag on upstream", command: SquadCliCommand.Upstream, args: ["remove", "-f", "org"] },
      { name: "--global on plugin", command: SquadCliCommand.Plugin, args: ["install", "--global", "x"] },
      { name: "--exec on init", command: SquadCliCommand.Init, args: ["--exec", "calc"] },
      { name: "--force on import", command: SquadCliCommand.Import, args: ["--force", "file.json"] },
      { name: "--yes on export", command: SquadCliCommand.Export, args: ["--yes"] },
      { name: "newline injection", command: SquadCliCommand.Upstream, args: ["add", "org/repo\nrm -rf /"] },
      { name: "carriage return injection", command: SquadCliCommand.Plugin, args: ["enable", "x\r--global"] },
      { name: "null byte injection", command: SquadCliCommand.Import, args: ["file.json\0--force"] },
    ];

    for (const { name, command, args } of rejected) {
      test(`rejects ${name}`, async () => {
        const fake = new FakeSquadCli().on([], fakeSquadReply.ok("should never run"));

        const result = await fake.createService().execute(command, { args });

        expectErr(result, "cli-execution-failed");
        assert.strictEqual(fake.spawnCount, 0, "a non-allowed invocation must not reach the process layer");
      });
    }

    for (const unknown of ["exec", "upgrade --self", "UPGRADE", "", "__proto__", "constructor", "toString"]) {
      test(`rejects the unknown command id ${JSON.stringify(unknown)} without spawning`, async () => {
        const fake = new FakeSquadCli().on([], fakeSquadReply.ok("should never run"));

        const result = await fake.createService().execute(unknown as SquadCliCommand);

        const error = expectErr(result, "cli-execution-failed");
        assert.match(error.message, /Unknown Squad command/);
        assert.strictEqual(fake.spawnCount, 0);
      });
    }
  });
});
