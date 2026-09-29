/**
 * Tests for the pure `.squad/model-config.json` validator (SQD-028, FR-063).
 */

import * as assert from "assert";
import { isSquadErr, isSquadOk } from "../../src/features/squad/models";
import {
  parseSquadModelConfig,
  serializeSquadModelConfig,
} from "../../src/features/squad/validation/squadModelConfigValidator";

suite("Unit: squadModelConfigValidator (SQD-028)", () => {
  test("accepts the Squad default + overrides shape", () => {
    const result = parseSquadModelConfig(
      JSON.stringify({ default: "gpt-5.6-terra", overrides: { neo: "gpt-5.6-sol", "tank-2": "gpt-5.6-luna" } })
    );

    assert.ok(isSquadOk(result));
    assert.deepStrictEqual(result.value, {
      defaultModel: "gpt-5.6-terra",
      overrides: [
        { agentId: "neo", model: "gpt-5.6-sol" },
        { agentId: "tank-2", model: "gpt-5.6-luna" },
      ],
    });
  });

  test("accepts an empty object and null default/overrides", () => {
    assert.deepStrictEqual(parseSquadModelConfig("{}"), { ok: true, value: { overrides: [] } });
    assert.deepStrictEqual(parseSquadModelConfig('{ "default": null, "overrides": null }'), {
      ok: true,
      value: { overrides: [] },
    });
  });

  test("tolerates unknown top-level keys for forward compatibility", () => {
    const result = parseSquadModelConfig('{ "default": "m", "fallback": ["x"], "$schema": "s" }');

    assert.ok(isSquadOk(result));
    assert.strictEqual(result.value.defaultModel, "m");
  });

  test("reports invalid JSON syntax with the parser detail", () => {
    const result = parseSquadModelConfig('{ "default": "m", }');

    assert.ok(isSquadErr(result));
    assert.strictEqual(result.error.code, "parse-failed");
    assert.ok(result.error.message.includes("not valid JSON"));
    assert.ok(result.error.remediation?.includes(".squad/model-config.json"));
    assert.ok(result.error.detail);
  });

  for (const [label, content] of [
    ["an array root", "[]"],
    ["a string root", '"gpt"'],
    ["a null root", "null"],
  ] as const) {
    test(`rejects ${label}`, () => {
      const result = parseSquadModelConfig(content);

      assert.ok(isSquadErr(result));
      assert.strictEqual(result.error.code, "parse-failed");
      assert.ok(result.error.detail?.includes("root value must be a JSON object"));
    });
  }

  test("rejects non-string, empty and whitespace model ids", () => {
    const result = parseSquadModelConfig(
      JSON.stringify({ default: 3, overrides: { neo: "", tank: "gpt 5", link: { model: "x" } } })
    );

    assert.ok(isSquadErr(result));
    const detail = result.error.detail ?? "";
    assert.ok(detail.includes('"default" must be a string'));
    assert.ok(detail.includes('agent "neo" must not be empty'));
    assert.ok(detail.includes('agent "tank" must not contain spaces'));
    assert.ok(detail.includes('agent "link" must be a string'));
  });

  test("rejects overrides that are not an object map", () => {
    const result = parseSquadModelConfig('{ "overrides": [["neo", "m"]] }');

    assert.ok(isSquadErr(result));
    assert.ok(result.error.detail?.includes('"overrides" must be an object'));
  });

  test("rejects unsafe or path-like agent ids", () => {
    const result = parseSquadModelConfig(
      JSON.stringify({ overrides: { "../escape": "m", "a/b": "m", "": "m", "has space": "m", "__proto__x": "m" } })
    );

    assert.ok(isSquadErr(result));
    const detail = result.error.detail ?? "";
    for (const key of ["../escape", "a/b", "has space", "__proto__x"]) {
      assert.ok(detail.includes(`"${key}"`), `expected ${key} to be reported`);
    }
  });

  test("rejects agent ids that only differ by case", () => {
    const result = parseSquadModelConfig('{ "overrides": { "Neo": "a", "neo": "b" } }');

    assert.ok(isSquadErr(result));
    assert.ok(result.error.detail?.includes('"neo" duplicates "Neo"'));
  });

  test("serialize round-trips through parse", () => {
    const config = {
      defaultModel: "gpt-5.6-terra",
      overrides: [{ agentId: "neo", model: "gpt-5.6-sol" }],
    };

    const json = serializeSquadModelConfig(config);

    assert.ok(json.endsWith("\n"));
    assert.deepStrictEqual(JSON.parse(json), { default: "gpt-5.6-terra", overrides: { neo: "gpt-5.6-sol" } });
    assert.deepStrictEqual(parseSquadModelConfig(json), { ok: true, value: config });
  });

  test("serialize omits an unset default", () => {
    assert.deepStrictEqual(JSON.parse(serializeSquadModelConfig({ overrides: [] })), { overrides: {} });
  });
});
