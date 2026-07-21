import * as assert from "assert";
import { formatJson } from "../../src/features/json-formatter/jsonFormatter";

suite("Unit: JsonFormatter", () => {
  test("formats JSON5 input as normalized JSON", () => {
    const result = formatJson("{ // a comment\n unquoted: 'value', trailing: true, }");

    assert.deepStrictEqual(result, {
      formattedJson: '{\n  "unquoted": "value",\n  "trailing": true\n}',
    });
  });

  test("returns a line and column for malformed multi-line input", () => {
    const result = formatJson("{\n  value: ,\n}");

    if (!("error" in result)) {
      assert.fail("Expected malformed input to return a validation error.");
    }

    assert.strictEqual(result.error.line, 2);
    assert.ok(result.error.column > 1);
    assert.match(result.error.message, /^JSON5:/);
  });
});