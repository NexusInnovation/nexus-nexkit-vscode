import * as assert from "assert";
import { parseStageDependencies } from "../../src/features/devops-pipelines/stageDependencies";

suite("Unit: parseStageDependencies", () => {
  test("a stage without dependsOn depends on the previous stage", () => {
    const result = parseStageDependencies("stages:\n- stage: A\n- stage: B\n- stage: C\n");

    assert.deepStrictEqual(
      [...(result ?? [])],
      [
        ["A", []],
        ["B", ["A"]],
        ["C", ["B"]],
      ]
    );
  });

  test("explicit dependsOn supports empty, string and list forms", () => {
    const result = parseStageDependencies(
      [
        "stages:",
        "- stage: A",
        "- stage: B",
        "  dependsOn: []",
        "- stage: C",
        "  dependsOn: A",
        "- stage: D",
        "  dependsOn: [B, C]",
      ].join("\n")
    );

    assert.deepStrictEqual(
      [...(result ?? [])],
      [
        ["A", []],
        ["B", []],
        ["C", ["A"]],
        ["D", ["B", "C"]],
      ]
    );
  });

  test("returns undefined for invalid YAML or documents without stages", () => {
    assert.strictEqual(parseStageDependencies("stages: [unclosed"), undefined);
    assert.strictEqual(parseStageDependencies("steps:\n- script: echo\n"), undefined);
    assert.strictEqual(parseStageDependencies(""), undefined);
  });
});
