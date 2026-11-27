import * as assert from "assert";
import { CRON_PRESETS, describeCronSchedule } from "../../src/features/cron-schedule-builder/webview/cronSchedule";

suite("Unit: Cron Schedule", () => {
  test("describes valid 5-field expressions", () => {
    const result = describeCronSchedule("*/5 * * * *");

    assert.strictEqual(result.description, "Every 5 minutes");
    assert.strictEqual(result.fieldCount, 5);
    assert.strictEqual(result.error, undefined);
  });

  test("describes valid 6-field expressions with seconds", () => {
    const result = describeCronSchedule("*/30 * * * * *");

    assert.strictEqual(result.description, "Every 30 seconds");
    assert.strictEqual(result.fieldCount, 6);
    assert.strictEqual(result.error, undefined);
  });

  test("rejects aliases, unsupported field counts, and malformed expressions", () => {
    assert.ok(describeCronSchedule("@daily").error);
    assert.ok(describeCronSchedule("* * * *").error);
    assert.ok(describeCronSchedule("* * * * * * *").error);
    assert.ok(describeCronSchedule("61 * * * *").error);
  });

  test("validates every common preset", () => {
    CRON_PRESETS.forEach((preset) => {
      assert.strictEqual(describeCronSchedule(preset.expression).error, undefined, preset.label);
    });
  });
});
