/**
 * Tests for cross-platform executable resolution in the Squad process runner
 * (SQD-005). Exercises `resolveSquadLaunch` directly so no real process is
 * spawned and both Windows and POSIX behavior can be asserted from any host.
 *
 * Covers the "look across every possible install location" requirement: an npm
 * global install ships shims (`squad.cmd` + `squad.ps1`) rather than a
 * `squad.exe`, and a `.ps1` cannot be spawned as a process directly.
 */

import * as assert from "assert";
import { resolveSquadLaunch } from "../../src/features/squad/services/squadProcessRunner";

suite("Unit: resolveSquadLaunch", () => {
  suite("POSIX", () => {
    test("Should spawn a bare command directly (PATH resolution)", () => {
      const launch = resolveSquadLaunch("squad", ["version"], { platform: "linux" });
      assert.strictEqual(launch.command, "squad");
      assert.deepStrictEqual(launch.args, ["version"]);
    });

    test("Should spawn an absolute path directly", () => {
      const launch = resolveSquadLaunch("/usr/local/bin/squad", ["version"], { platform: "darwin" });
      assert.strictEqual(launch.command, "/usr/local/bin/squad");
      assert.deepStrictEqual(launch.args, ["version"]);
    });
  });

  suite("Windows", () => {
    test("Should route a .ps1 shim through PowerShell (npm global squad.ps1)", () => {
      const ps1 = "C:\\Users\\dev\\AppData\\Roaming\\npm\\squad.ps1";
      const launch = resolveSquadLaunch(ps1, ["version"], { platform: "win32" });

      assert.strictEqual(launch.command, "powershell.exe");
      assert.deepStrictEqual(launch.args, [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ps1,
        "version",
      ]);
    });

    test("Should route a bare command through cmd.exe (resolves .cmd via PATHEXT)", () => {
      const launch = resolveSquadLaunch("squad", ["version"], {
        platform: "win32",
        comSpec: "C:\\Windows\\System32\\cmd.exe",
      });

      assert.strictEqual(launch.command, "C:\\Windows\\System32\\cmd.exe");
      assert.deepStrictEqual(launch.args, ["/d", "/s", "/c", "squad", "version"]);
    });

    test("Should route a .cmd shim through cmd.exe", () => {
      const cmd = "C:\\Users\\dev\\AppData\\Roaming\\npm\\squad.cmd";
      const launch = resolveSquadLaunch(cmd, ["version"], { platform: "win32" });

      assert.strictEqual(launch.command, "cmd.exe");
      assert.deepStrictEqual(launch.args, ["/d", "/s", "/c", cmd, "version"]);
    });

    test("Should spawn an absolute .exe directly", () => {
      const exe = "C:\\tools\\squad.exe";
      const launch = resolveSquadLaunch(exe, ["version"], { platform: "win32" });

      assert.strictEqual(launch.command, exe);
      assert.deepStrictEqual(launch.args, ["version"]);
    });

    test("Should fall back to cmd.exe when ComSpec is unset", () => {
      const launch = resolveSquadLaunch("npx", ["--yes", "pkg"], { platform: "win32" });
      assert.strictEqual(launch.command, "cmd.exe");
      assert.deepStrictEqual(launch.args, ["/d", "/s", "/c", "npx", "--yes", "pkg"]);
    });
  });
});
