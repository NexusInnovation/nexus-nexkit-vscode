/**
 * Unit tests for the script resolution pure functions.
 *
 * Platform is always an explicit argument, so both OS branches are exercised on
 * a single test runner rather than only the host OS.
 */

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import {
  ALLOWED_SCRIPT_FILE_NAMES,
  DEFAULT_SCRIPTS_PATH,
  REQUIREMENTS_FILE_NAME,
  assertContained,
  isAllowedScriptFileName,
  isSupportedPlatform,
  parseValidationMarker,
  resolveScriptFileName,
  resolveScriptUri,
  resolveScriptsRootUri,
  toSafeRelativeSegments,
} from "../../src/features/prerequisite-automation/scriptResolver";
import { PrerequisiteError } from "../../src/features/prerequisite-automation/types";
import {
  WORKSPACE_ROOT,
  assertNoAbsolutePaths,
  captureError,
  validatedMarker,
} from "./helpers/prerequisiteTestHelpers";

suite("Unit: scriptResolver — platform mapping", () => {
  test("win32 resolves the PascalCase PowerShell scripts", () => {
    assert.strictEqual(resolveScriptFileName("check", "win32"), "Check-Validation.ps1");
    assert.strictEqual(resolveScriptFileName("validate", "win32"), "Validate-Prerequisites.ps1");
    assert.strictEqual(resolveScriptFileName("setup", "win32"), "Setup-Environment.ps1");
  });

  test("linux resolves the lowercase shell scripts", () => {
    assert.strictEqual(resolveScriptFileName("check", "linux"), "check-validation.sh");
    assert.strictEqual(resolveScriptFileName("validate", "linux"), "validate-prerequisites.sh");
    assert.strictEqual(resolveScriptFileName("setup", "linux"), "setup-environment.sh");
  });

  test("darwin resolves the same shell scripts as linux", () => {
    for (const step of ["check", "validate", "setup"] as const) {
      assert.strictEqual(resolveScriptFileName(step, "darwin"), resolveScriptFileName(step, "linux"));
    }
  });

  test("casing is locked: .ps1 names are PascalCase, .sh names are all-lowercase", () => {
    // A case drift here silently breaks case-sensitive filesystems, which is
    // exactly the class of bug that only shows up on a colleague's machine.
    for (const step of ["check", "validate", "setup"] as const) {
      const windows = resolveScriptFileName(step, "win32");
      const posix = resolveScriptFileName(step, "linux");

      assert.ok(windows.endsWith(".ps1"), `${windows} must end with .ps1`);
      assert.strictEqual(posix, posix.toLowerCase(), `${posix} must be entirely lowercase`);
      assert.ok(posix.endsWith(".sh"), `${posix} must end with .sh`);
      assert.notStrictEqual(windows, windows.toLowerCase(), `${windows} must keep its PascalCase`);
    }
  });

  test("an unsupported platform raises a Configuration error naming the platform", () => {
    const error = captureError(() => resolveScriptFileName("check", "aix" as NodeJS.Platform));

    assert.strictEqual(error.category, "Configuration");
    assert.ok(error.message.includes("aix"));
    assert.ok((error.remediation ?? "").length > 0, "an unsupported platform must carry remediation text");
  });

  test("isSupportedPlatform recognises exactly the three shipped platforms", () => {
    assert.strictEqual(isSupportedPlatform("win32"), true);
    assert.strictEqual(isSupportedPlatform("linux"), true);
    assert.strictEqual(isSupportedPlatform("darwin"), true);
    assert.strictEqual(isSupportedPlatform("freebsd" as NodeJS.Platform), false);
    assert.strictEqual(isSupportedPlatform("android" as NodeJS.Platform), false);
  });
});

suite("Unit: scriptResolver — filename allowlist", () => {
  test("the allowlist holds exactly the six reference scripts", () => {
    assert.strictEqual(ALLOWED_SCRIPT_FILE_NAMES.length, 6);
    assert.deepStrictEqual(
      [...ALLOWED_SCRIPT_FILE_NAMES].sort(),
      [
        "Check-Validation.ps1",
        "Setup-Environment.ps1",
        "Validate-Prerequisites.ps1",
        "check-validation.sh",
        "setup-environment.sh",
        "validate-prerequisites.sh",
      ].sort()
    );
  });

  test("arbitrary filenames are rejected", () => {
    assert.strictEqual(isAllowedScriptFileName("payload.sh"), false);
    assert.strictEqual(isAllowedScriptFileName("../../etc/passwd"), false);
    assert.strictEqual(isAllowedScriptFileName("check-validation.SH"), false);
  });

  test("resolveScriptUri refuses a filename outside the allowlist", () => {
    const scriptsRoot = vscode.Uri.joinPath(WORKSPACE_ROOT, "scripts");
    const error = captureError(() => resolveScriptUri(scriptsRoot, "rm-rf.sh"));

    assert.strictEqual(error.category, "Configuration");
  });

  test("resolveScriptUri joins an allowlisted filename onto the scripts root", () => {
    const scriptsRoot = vscode.Uri.joinPath(WORKSPACE_ROOT, "scripts");
    const uri = resolveScriptUri(scriptsRoot, "check-validation.sh");
    assert.strictEqual(path.basename(uri.fsPath), "check-validation.sh");
    assert.ok(uri.fsPath.startsWith(scriptsRoot.fsPath));
  });

  test("the requirements filename constant is stable", () => {
    assert.strictEqual(REQUIREMENTS_FILE_NAME, "requirements.json");
    assert.strictEqual(DEFAULT_SCRIPTS_PATH, "scripts");
  });
});

suite("Unit: scriptResolver — path containment", () => {
  test("a simple relative folder splits into segments", () => {
    assert.deepStrictEqual(toSafeRelativeSegments("scripts"), ["scripts"]);
    assert.deepStrictEqual(toSafeRelativeSegments("tools/prereq"), ["tools", "prereq"]);
    assert.deepStrictEqual(toSafeRelativeSegments("tools\\prereq"), ["tools", "prereq"]);
  });

  test("empty, whitespace and dot paths fall back to the default folder", () => {
    assert.deepStrictEqual(toSafeRelativeSegments(""), [DEFAULT_SCRIPTS_PATH]);
    assert.deepStrictEqual(toSafeRelativeSegments("   "), [DEFAULT_SCRIPTS_PATH]);
    assert.deepStrictEqual(toSafeRelativeSegments("./"), [DEFAULT_SCRIPTS_PATH]);
  });

  test("a POSIX absolute path is rejected", () => {
    const error = captureError(() => toSafeRelativeSegments("/etc/scripts"));
    assert.strictEqual(error.category, "Configuration");
    assert.ok(error.message.includes("relative"));
  });

  test("a drive-qualified Windows path is rejected", () => {
    assert.throws(() => toSafeRelativeSegments("C:\\Windows\\System32"), PrerequisiteError);
    assert.throws(() => toSafeRelativeSegments("D:/payload"), PrerequisiteError);
  });

  test("a UNC path is rejected", () => {
    assert.throws(() => toSafeRelativeSegments("\\\\server\\share"), PrerequisiteError);
  });

  test("any parent-directory escape is rejected", () => {
    assert.throws(() => toSafeRelativeSegments(".."), PrerequisiteError);
    assert.throws(() => toSafeRelativeSegments("../outside"), PrerequisiteError);
    assert.throws(() => toSafeRelativeSegments("scripts/../../etc"), PrerequisiteError);
    assert.throws(() => toSafeRelativeSegments("a/b/../../.."), PrerequisiteError);
  });

  test("the rejection message never leaks the offending absolute path", () => {
    try {
      toSafeRelativeSegments("/etc/passwd");
      assert.fail("expected a PrerequisiteError");
    } catch (error) {
      assert.ok(error instanceof PrerequisiteError);
      assertNoAbsolutePaths(error.toUserMessage(), "toSafeRelativeSegments rejection");
    }
  });

  test("assertContained accepts the root itself and a descendant", () => {
    const root = WORKSPACE_ROOT.fsPath;
    assert.doesNotThrow(() => assertContained(root, root));
    assert.doesNotThrow(() => assertContained(path.join(root, "scripts"), root));
    assert.doesNotThrow(() => assertContained(path.join(root, "a", "b", "c"), root));
  });

  test("assertContained rejects a sibling whose name merely shares the prefix", () => {
    // "/ws-evil" starts with "/ws" as a string but is not inside it.
    const root = WORKSPACE_ROOT.fsPath;
    assert.throws(() => assertContained(`${root}-evil`, root), PrerequisiteError);
  });

  test("assertContained rejects an escape outside the root", () => {
    const root = WORKSPACE_ROOT.fsPath;
    assert.throws(() => assertContained(path.join(root, "..", "elsewhere"), root), PrerequisiteError);
  });

  test("resolveScriptsRootUri produces a contained URI for a relative folder", () => {
    const resolved = resolveScriptsRootUri(WORKSPACE_ROOT, "tools/prereq");
    assert.ok(resolved.fsPath.startsWith(WORKSPACE_ROOT.fsPath));
    assert.strictEqual(path.basename(resolved.fsPath), "prereq");
  });

  test("resolveScriptsRootUri rejects an absolute configured path", () => {
    assert.throws(() => resolveScriptsRootUri(WORKSPACE_ROOT, "/etc"), PrerequisiteError);
  });
});

suite("Unit: scriptResolver — ::VALIDATED:: marker parsing", () => {
  test("a positive marker parses to true", () => {
    assert.strictEqual(parseValidationMarker(validatedMarker(true)), true);
  });

  test("a negative marker parses to false", () => {
    assert.strictEqual(parseValidationMarker(validatedMarker(false)), false);
  });

  test("a CRLF-terminated marker parses correctly", () => {
    // Check-Validation.ps1 is pinned to CRLF by .gitattributes precisely so this
    // path is exercised deterministically. A parser that keeps the \r breaks.
    assert.strictEqual(parseValidationMarker("::VALIDATED::true\r\n"), true);
    assert.strictEqual(parseValidationMarker("::VALIDATED::false\r\n"), false);
  });

  test("a marker followed by the AFEAS001 problem line still parses", () => {
    const stdout =
      "::VALIDATED::false\r\n" +
      "afeas.local.settings.json: error AFEAS001: Prerequis AFEAS non valides -- lancez la tache " +
      "'validate-prerequisites' pour corriger (Ctrl+Shift+P > Executer une tache).\r\n";
    assert.strictEqual(parseValidationMarker(stdout), false);
  });

  test("a marker embedded in surrounding output is found", () => {
    const stdout = "Checking prerequisites...\nsome noise\n::VALIDATED::true\nDone.\n";
    assert.strictEqual(parseValidationMarker(stdout), true);
  });

  test("no marker at all yields undefined rather than a default", () => {
    assert.strictEqual(parseValidationMarker(""), undefined);
    assert.strictEqual(parseValidationMarker("no marker here"), undefined);
    assert.strictEqual(parseValidationMarker("::VALIDATED::maybe"), undefined);
  });

  test("when several markers are emitted the first one wins", () => {
    // The scripts emit the marker once, before any other output. First-match is
    // what the contract describes; last-match would let incidental later text
    // override the script's own verdict.
    assert.strictEqual(parseValidationMarker("::VALIDATED::false\n::VALIDATED::true\n"), false);
    assert.strictEqual(parseValidationMarker("::VALIDATED::true\n::VALIDATED::false\n"), true);
  });

  test("the parser is case-sensitive, matching the script contract", () => {
    // Previously the parser used the /i flag and accepted casings the contract
    // declares invalid. It is now strict: only the canonical casing is a marker,
    // and anything else is treated as ordinary output.
    assert.strictEqual(parseValidationMarker("::validated::true"), undefined);
    assert.strictEqual(parseValidationMarker("::VALIDATED::TRUE"), undefined);
    assert.strictEqual(parseValidationMarker("::Validated::False"), undefined);
  });

  test("whitespace between the marker and the value is not tolerated", () => {
    // The contract has no separator, so neither does the parser.
    assert.strictEqual(parseValidationMarker("::VALIDATED:: true"), undefined);
    assert.strictEqual(parseValidationMarker("::VALIDATED::\ntrue"), undefined);
  });
});
