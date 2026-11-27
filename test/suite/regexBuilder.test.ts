import * as assert from "assert";
import { createRegExp, getHighlightSegments, PATTERN_PRESETS } from "../../src/features/regex-builder/regexBuilder";

suite("Unit: RegEx Builder", () => {
  test("Should create JavaScript regular expressions with supplied flags", () => {
    const expression = createRegExp("nexkit", "gi");

    assert.ok(expression.test("NEXKIT"));
  });

  test("Should separate matching text into highlight segments", () => {
    const segments = getHighlightSegments("one two one", createRegExp("one", "g"));

    assert.deepStrictEqual(segments, [
      { text: "one", isMatch: true },
      { text: " two ", isMatch: false },
      { text: "one", isMatch: true },
    ]);
  });

  test("Should provide common pattern presets", () => {
    assert.ok(PATTERN_PRESETS.some((preset) => preset.name === "Email"));
    assert.ok(PATTERN_PRESETS.some((preset) => preset.name === "URL"));
  });
});
