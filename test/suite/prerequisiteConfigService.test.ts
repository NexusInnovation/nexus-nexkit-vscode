/**
 * Unit tests for `requirements.json` discovery and schema validation.
 *
 * A workspace with no configuration is the common case across arbitrary
 * repositories and must stay a calm no-op — never an error dialog.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { SettingsManager } from "../../src/core/settingsManager";
import {
  PrerequisiteConfigService,
  parseRequirementsJson,
} from "../../src/features/prerequisite-automation/prerequisiteConfigService";
import { REQUIREMENTS_FILE_NAME } from "../../src/features/prerequisite-automation/scriptResolver";
import { PrerequisiteError } from "../../src/features/prerequisite-automation/types";
import {
  FakeFileSystem,
  FakeLogger,
  UnreadableFileSystem,
  WORKSPACE_ROOT,
  assertNoAbsolutePaths,
  captureError,
  captureErrorAsync,
} from "./helpers/prerequisiteTestHelpers";

const VALID_JSON = JSON.stringify({
  prerequisites: [
    { name: "Node.js", command: "node", versionCommand: "node --version", required: true, minimumVersion: "24.0.0" },
    { name: "jq", command: "jq", required: false },
  ],
});

suite("Unit: parseRequirementsJson — schema validation", () => {
  test("a well-formed document parses into typed prerequisites", () => {
    const config = parseRequirementsJson(VALID_JSON);

    assert.strictEqual(config.prerequisites.length, 2);
    assert.strictEqual(config.prerequisites[0].name, "Node.js");
    assert.strictEqual(config.prerequisites[0].command, "node");
    assert.strictEqual(config.prerequisites[0].minimumVersion, "24.0.0");
    assert.strictEqual(config.prerequisites[0].required, true);
    assert.strictEqual(config.prerequisites[1].required, false);
  });

  test("an empty prerequisites array is valid", () => {
    const config = parseRequirementsJson(JSON.stringify({ prerequisites: [] }));
    assert.deepStrictEqual(config.prerequisites, []);
  });

  test("required defaults to true when the field is absent", () => {
    const config = parseRequirementsJson(JSON.stringify({ prerequisites: [{ name: "Git", command: "git" }] }));
    assert.strictEqual(config.prerequisites[0].required, true);
  });

  test("unknown extra fields are tolerated and dropped", () => {
    const config = parseRequirementsJson(
      JSON.stringify({
        prerequisites: [{ name: "Git", command: "git", futureField: 42, anotherOne: { nested: true } }],
        someTopLevelExtra: "ignored",
      })
    );

    assert.strictEqual(config.prerequisites.length, 1);
    assert.strictEqual((config.prerequisites[0] as unknown as Record<string, unknown>).futureField, undefined);
  });

  test("malformed JSON is a Configuration error with remediation", () => {
    const error = captureError(() => parseRequirementsJson("{ not json"));
    assert.strictEqual(error.category, "Configuration");
    assert.ok(error.message.includes(REQUIREMENTS_FILE_NAME));
    assert.ok((error.remediation ?? "").length > 0);
  });

  test("a JSON array at the root is rejected", () => {
    assert.strictEqual(captureError(() => parseRequirementsJson("[]")).category, "Configuration");
  });

  test("a JSON scalar at the root is rejected", () => {
    assert.strictEqual(captureError(() => parseRequirementsJson("null")).category, "Configuration");
    assert.strictEqual(captureError(() => parseRequirementsJson('"text"')).category, "Configuration");
  });

  test("a missing prerequisites array is rejected", () => {
    const error = captureError(() => parseRequirementsJson(JSON.stringify({ tools: [] })));
    assert.strictEqual(error.category, "Configuration");
    assert.ok(error.message.includes("prerequisites"));
  });

  test("a non-object entry is rejected and identified by position", () => {
    const error = captureError(() =>
      parseRequirementsJson(JSON.stringify({ prerequisites: [{ name: "Git", command: "git" }, "nope"] }))
    );
    assert.strictEqual(error.category, "Configuration");
    assert.ok(error.message.includes("#2"), "the message must point at the offending entry");
  });

  test("a missing required field is rejected", () => {
    assert.strictEqual(
      captureError(() => parseRequirementsJson(JSON.stringify({ prerequisites: [{ command: "git" }] }))).category,
      "Configuration"
    );
    assert.strictEqual(
      captureError(() => parseRequirementsJson(JSON.stringify({ prerequisites: [{ name: "Git" }] }))).category,
      "Configuration"
    );
  });

  test("a non-string name or command is rejected", () => {
    assert.strictEqual(
      captureError(() => parseRequirementsJson(JSON.stringify({ prerequisites: [{ name: 7, command: "git" }] })))
        .category,
      "Configuration"
    );
  });

  test("a non-boolean required is rejected rather than coerced", () => {
    const error = captureError(() =>
      parseRequirementsJson(JSON.stringify({ prerequisites: [{ name: "Git", command: "git", required: "yes" }] }))
    );
    assert.ok(error.message.includes("required"));
  });

  test("a null install block is tolerated", () => {
    const config = parseRequirementsJson(
      JSON.stringify({ prerequisites: [{ name: "Git", command: "git", install: null }] })
    );
    assert.strictEqual(config.prerequisites[0].install, undefined);
  });

  test("null members inside install are skipped, matching the shipped sample", () => {
    // The real requirements.json carries `"npm": null` for several tools.
    const config = parseRequirementsJson(
      JSON.stringify({
        prerequisites: [{ name: "Node.js", command: "node", install: { winget: "winget install x", npm: null } }],
      })
    );

    assert.strictEqual(config.prerequisites[0].install?.winget, "winget install x");
    assert.strictEqual(config.prerequisites[0].install?.npm, undefined);
  });

  test("an install block containing a shell chain operator is retained verbatim as display text", () => {
    // The shipped sample really does contain "&". It is display-only and must
    // never be executed — the parser's job is only to keep it as a string.
    const config = parseRequirementsJson(
      JSON.stringify({
        prerequisites: [{ name: "pnpm", command: "pnpm", install: { winget: "winget install pnpm & pnpm setup" } }],
      })
    );
    assert.strictEqual(config.prerequisites[0].install?.winget, "winget install pnpm & pnpm setup");
  });

  test("a non-object install block is rejected", () => {
    assert.strictEqual(
      captureError(() =>
        parseRequirementsJson(JSON.stringify({ prerequisites: [{ name: "Git", command: "git", install: [] }] }))
      ).category,
      "Configuration"
    );
  });

  test("an over-long string field is rejected", () => {
    const error = captureError(() =>
      parseRequirementsJson(JSON.stringify({ prerequisites: [{ name: "x".repeat(600), command: "git" }] }))
    );
    assert.ok(error.message.includes("512"));
  });

  test("more than 200 prerequisites is rejected", () => {
    const many = Array.from({ length: 201 }, (_, index) => ({ name: `tool${index}`, command: "x" }));
    const error = captureError(() => parseRequirementsJson(JSON.stringify({ prerequisites: many })));
    assert.ok(error.message.includes("200"));
  });

  test("a document over the size cap is rejected before parsing", () => {
    const huge = JSON.stringify({ prerequisites: [], padding: "x".repeat(300 * 1024) });
    const error = captureError(() => parseRequirementsJson(huge));
    assert.strictEqual(error.category, "Configuration");
    assert.ok(error.message.includes("KB"));
  });

  test("no schema error ever leaks an absolute path", () => {
    for (const bad of ["{ not json", "[]", JSON.stringify({ tools: [] })]) {
      assertNoAbsolutePaths(captureError(() => parseRequirementsJson(bad)).toUserMessage(), bad);
    }
  });
});

suite("Unit: PrerequisiteConfigService — discovery", () => {
  let sandbox: sinon.SinonSandbox;
  let logger: FakeLogger;
  const scriptsRootPath = vscode.Uri.joinPath(WORKSPACE_ROOT, "scripts").fsPath;
  const configPath = vscode.Uri.joinPath(WORKSPACE_ROOT, REQUIREMENTS_FILE_NAME).fsPath;

  setup(() => {
    sandbox = sinon.createSandbox();
    logger = new FakeLogger();
    sandbox.stub(SettingsManager, "getPrerequisitesScriptsPath").returns("scripts");
  });

  teardown(() => {
    sandbox.restore();
  });

  function serviceWith(fileSystem: FakeFileSystem | UnreadableFileSystem, roots = [WORKSPACE_ROOT]): PrerequisiteConfigService {
    const service = new PrerequisiteConfigService(logger, fileSystem);
    sandbox.stub(service, "getWorkspaceRootCandidates").returns(roots);
    return service;
  }

  test("a workspace with no configuration resolves to absent, not an error", async () => {
    const result = await serviceWith(new FakeFileSystem()).load();

    assert.strictEqual(result.kind, "absent");
    assert.ok(logger.hasMessageContaining("no requirements.json found"));
  });

  test("no open folder resolves to absent", async () => {
    const result = await serviceWith(new FakeFileSystem(), []).load();
    assert.strictEqual(result.kind, "absent");
  });

  test("a present configuration is loaded and parsed", async () => {
    const fs = new FakeFileSystem().addFile(configPath, VALID_JSON);
    const result = await serviceWith(fs).load();

    assert.strictEqual(result.kind, "found");
    if (result.kind !== "found") {
      return;
    }
    assert.strictEqual(result.config.prerequisites.length, 2);
    assert.strictEqual(result.configPath, configPath);
    assert.strictEqual(result.workspaceRoot.fsPath, WORKSPACE_ROOT.fsPath);
    assert.strictEqual(result.scriptsRoot.fsPath, scriptsRootPath);
  });

  test("the first candidate root carrying a configuration wins", async () => {
    const secondRoot = vscode.Uri.joinPath(WORKSPACE_ROOT, "..", "other");
    const secondConfig = vscode.Uri.joinPath(secondRoot, REQUIREMENTS_FILE_NAME).fsPath;
    const fs = new FakeFileSystem().addFile(secondConfig, VALID_JSON);

    const result = await serviceWith(fs, [WORKSPACE_ROOT, secondRoot]).load();

    assert.strictEqual(result.kind, "found");
    if (result.kind === "found") {
      assert.strictEqual(result.configPath, secondConfig);
    }
  });

  test("malformed JSON in a discovered file surfaces as a Configuration error", async () => {
    const fs = new FakeFileSystem().addFile(configPath, "{ nope");
    const error = await captureErrorAsync(() => serviceWith(fs).load());

    assert.strictEqual(error.category, "Configuration");
    assertNoAbsolutePaths(error.toUserMessage(), "malformed config load");
  });

  test("an unreadable configuration surfaces as a Permission error, not a crash", async () => {
    const error = await captureErrorAsync(() => serviceWith(new UnreadableFileSystem(configPath)).load());

    assert.strictEqual(error.category, "Permission");
    assert.ok((error.remediation ?? "").length > 0);
    assertNoAbsolutePaths(error.toUserMessage(), "unreadable config load");
  });

  test("a symlinked scripts folder escaping the workspace is rejected after resolution", async () => {
    const fs = new FakeFileSystem()
      .addFile(configPath, VALID_JSON)
      .setRealPath(WORKSPACE_ROOT.fsPath, WORKSPACE_ROOT.fsPath)
      .setRealPath(scriptsRootPath, vscode.Uri.file(process.platform === "win32" ? "C:\\elsewhere" : "/elsewhere").fsPath);

    const error = await captureErrorAsync(() => serviceWith(fs).load());

    assert.strictEqual(error.category, "Configuration");
    assertNoAbsolutePaths(error.toUserMessage(), "symlink escape");
  });

  test("an absolute configured scripts path is rejected once a configuration is found", async () => {
    (SettingsManager.getPrerequisitesScriptsPath as sinon.SinonStub).returns("/etc");
    const fs = new FakeFileSystem().addFile(configPath, VALID_JSON);
    const error = await captureErrorAsync(() => serviceWith(fs).load());
    assert.strictEqual(error.category, "Configuration");
  });

  test("a parent-escaping configured scripts path is rejected once a configuration is found", async () => {
    (SettingsManager.getPrerequisitesScriptsPath as sinon.SinonStub).returns("../../outside");
    const fs = new FakeFileSystem().addFile(configPath, VALID_JSON);
    const error = await captureErrorAsync(() => serviceWith(fs).load());
    assert.strictEqual(error.category, "Configuration");
  });

  test("an unsafe scripts path is inert in a workspace with no configuration", async () => {
    // The scripts directory is irrelevant until a configuration exists, so an
    // unrelated workspace must never see an error about a setting it does not use.
    (SettingsManager.getPrerequisitesScriptsPath as sinon.SinonStub).returns("../../outside");

    const result = await serviceWith(new FakeFileSystem()).load();

    assert.strictEqual(result.kind, "absent");
  });

  test("the configuration is read from the root even when the scripts folder is customised", async () => {
    (SettingsManager.getPrerequisitesScriptsPath as sinon.SinonStub).returns("tools/prereq");
    const fs = new FakeFileSystem().addFile(configPath, VALID_JSON);

    const result = await serviceWith(fs).load();

    assert.strictEqual(result.kind, "found");
    if (result.kind === "found") {
      assert.strictEqual(result.configPath, configPath);
      assert.strictEqual(result.scriptsRoot.fsPath, vscode.Uri.joinPath(WORKSPACE_ROOT, "tools", "prereq").fsPath);
    }
  });

  test("a configuration inside the scripts folder is no longer discovered", async () => {
    const legacyConfig = vscode.Uri.joinPath(WORKSPACE_ROOT, "scripts", REQUIREMENTS_FILE_NAME).fsPath;
    const fs = new FakeFileSystem().addFile(legacyConfig, VALID_JSON);

    const result = await serviceWith(fs).load();

    assert.strictEqual(result.kind, "absent");
  });

  test("PrerequisiteError instances survive the symlink guard unchanged", async () => {
    // Regression guard: the containment failure must not be swallowed by the
    // catch that tolerates realpath being unavailable.
    const fs = new FakeFileSystem()
      .addFile(configPath, VALID_JSON)
      .setRealPath(scriptsRootPath, `${WORKSPACE_ROOT.fsPath}-evil`);

    const error = await captureErrorAsync(() => serviceWith(fs).load());
    assert.ok(error instanceof PrerequisiteError);
  });
});
