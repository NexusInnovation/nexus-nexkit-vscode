/**
 * Tests for Squad result helpers and type guards.
 */

import * as assert from "assert";
import {
  isSquadErr,
  isSquadOk,
  squadErr,
  squadOk,
  SQUAD_ERROR_CODES,
  SquadError,
} from "../../src/features/squad/models/squadResult";

suite("Unit: Squad Result", () => {
  suite("squadOk", () => {
    test("Should build a success result carrying the value", () => {
      const result = squadOk(42);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.value, 42);
    });

    test("Should preserve object values by reference", () => {
      const value = { a: 1 };
      const result = squadOk(value);

      assert.strictEqual(result.value, value);
    });
  });

  suite("squadErr", () => {
    test("Should build a failure result carrying the error", () => {
      const error: SquadError = {
        code: "cli-not-found",
        message: "Squad CLI not found",
        remediation: "Install with npm install -g @bradygaster/squad-cli",
      };
      const result = squadErr(error);

      assert.strictEqual(result.ok, false);
      assert.deepStrictEqual(result.error, error);
    });
  });

  suite("Type guards", () => {
    test("isSquadOk should narrow success results", () => {
      const result = squadOk("value");

      assert.strictEqual(isSquadOk(result), true);
      assert.strictEqual(isSquadErr(result), false);
    });

    test("isSquadErr should narrow failure results", () => {
      const result = squadErr({ code: "unknown", message: "boom" });

      assert.strictEqual(isSquadErr(result), true);
      assert.strictEqual(isSquadOk(result), false);
    });
  });

  suite("SQUAD_ERROR_CODES", () => {
    test("Should expose stable, unique error codes", () => {
      const unique = new Set(SQUAD_ERROR_CODES);

      assert.strictEqual(unique.size, SQUAD_ERROR_CODES.length);
      assert.ok(SQUAD_ERROR_CODES.includes("cli-timeout"));
    });
  });
});
