import * as assert from "assert";
import { applyTabOrder, moveTab, shiftTab } from "../../src/features/panel-ui/webview/utils/tabOrder";

const defaults = ["project", "marketplaces", "tools"];

suite("Unit: tab order helpers", () => {
  test("applyTabOrder returns the defaults without a stored order", () => {
    assert.deepStrictEqual(applyTabOrder(defaults, undefined), defaults);
    assert.deepStrictEqual(applyTabOrder(defaults, []), defaults);
  });

  test("applyTabOrder honours the stored order, drops unknown ids and appends new tabs", () => {
    assert.deepStrictEqual(applyTabOrder(defaults, ["tools", "gone", "project"]), ["tools", "project", "marketplaces"]);
    assert.deepStrictEqual(applyTabOrder(defaults, ["tools", "tools", "project"]), ["tools", "project", "marketplaces"]);
  });

  test("moveTab puts the dragged tab at the target position in both directions", () => {
    assert.deepStrictEqual(moveTab(defaults, "tools", "project"), ["tools", "project", "marketplaces"]);
    assert.deepStrictEqual(moveTab(defaults, "project", "tools"), ["marketplaces", "tools", "project"]);
  });

  test("moveTab ignores unknown ids and identical source/target", () => {
    assert.strictEqual(moveTab(defaults, "project", "project"), defaults);
    assert.strictEqual(moveTab(defaults, "nope", "project"), defaults);
  });

  test("shiftTab moves one step and stops at the edges", () => {
    assert.deepStrictEqual(shiftTab(defaults, "marketplaces", -1), ["marketplaces", "project", "tools"]);
    assert.deepStrictEqual(shiftTab(defaults, "marketplaces", 1), ["project", "tools", "marketplaces"]);
    assert.strictEqual(shiftTab(defaults, "project", -1), defaults);
    assert.strictEqual(shiftTab(defaults, "tools", 1), defaults);
  });
});
