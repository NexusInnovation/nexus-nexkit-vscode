/**
 * Unit tests for the bounded output capture.
 *
 * A runaway script must never be able to grow the extension host's memory, and
 * the tail of the output — where the failure reason lives — must survive.
 */

import * as assert from "assert";
import { OutputBuffer } from "../../src/features/prerequisite-automation/outputBuffer";

suite("Unit: OutputBuffer", () => {
  test("a new buffer is empty and not truncated", () => {
    const buffer = new OutputBuffer(100);
    assert.strictEqual(buffer.toString(), "");
    assert.strictEqual(buffer.truncated, false);
  });

  test("an empty chunk is ignored", () => {
    const buffer = new OutputBuffer(100);
    buffer.append("");
    assert.strictEqual(buffer.toString(), "");
    assert.strictEqual(buffer.truncated, false);
  });

  test("content under the cap is preserved verbatim", () => {
    const buffer = new OutputBuffer(100);
    buffer.append("first\n");
    buffer.append("second\n");

    assert.strictEqual(buffer.toString(), "first\nsecond\n");
    assert.strictEqual(buffer.truncated, false);
  });

  test("content exactly at the cap is not truncated", () => {
    const buffer = new OutputBuffer(10);
    buffer.append("0123456789");

    assert.strictEqual(buffer.toString(), "0123456789");
    assert.strictEqual(buffer.truncated, false);
  });

  test("older chunks are evicted so the tail survives", () => {
    // Eviction stops as soon as the buffer is back within budget, so the most
    // recent chunks are kept and only the oldest are dropped.
    const buffer = new OutputBuffer(10);
    buffer.append("aaaaa");
    buffer.append("bbbbb");
    buffer.append("ccccc");

    assert.strictEqual(buffer.truncated, true);
    assert.strictEqual(buffer.toString(), "bbbbbccccc");
    assert.ok(!buffer.toString().includes("a"), "the oldest chunk must be dropped first");
    assert.ok(Buffer.byteLength(buffer.toString(), "utf8") <= 10);
  });

  test("the marker at the end of a long run is never lost", () => {
    // The `::VALIDATED::` marker is emitted last; losing it would silently
    // turn a successful validation into an unknown result.
    const buffer = new OutputBuffer(64);
    for (let index = 0; index < 50; index++) {
      buffer.append(`noise line ${index}\n`);
    }
    buffer.append("::VALIDATED::true\n");

    assert.ok(buffer.toString().includes("::VALIDATED::true"));
    assert.strictEqual(buffer.truncated, true);
  });

  test("a single oversized chunk is tail-sliced rather than dropped entirely", () => {
    const buffer = new OutputBuffer(10);
    buffer.append("0123456789ABCDEF");

    assert.strictEqual(buffer.truncated, true);
    assert.strictEqual(buffer.toString(), "6789ABCDEF");
  });

  test("a single oversized chunk arriving after eviction still keeps its tail", () => {
    const buffer = new OutputBuffer(8);
    buffer.append("xxxx");
    buffer.append("0123456789ABCDEF");

    assert.strictEqual(buffer.truncated, true);
    assert.strictEqual(buffer.toString(), "89ABCDEF");
  });

  test("capacity is measured in UTF-8 bytes, not characters", () => {
    // A multi-byte payload must not be able to exceed the byte budget by
    // exploiting a character-based count.
    const buffer = new OutputBuffer(10);
    buffer.append("émoji"); // 6 bytes
    buffer.append("ünïcöde"); // 10 bytes

    assert.strictEqual(buffer.truncated, true);
    assert.ok(Buffer.byteLength(buffer.toString(), "utf8") <= 10);
  });

  test("the truncated flag is sticky once set", () => {
    const buffer = new OutputBuffer(5);
    buffer.append("aaaaa");
    buffer.append("bbbbb");
    assert.strictEqual(buffer.truncated, true);

    buffer.append("c");
    assert.strictEqual(buffer.truncated, true);
  });

  test("many small chunks stay bounded", () => {
    const buffer = new OutputBuffer(100);
    for (let index = 0; index < 10_000; index++) {
      buffer.append(`line ${index}\n`);
    }

    assert.ok(Buffer.byteLength(buffer.toString(), "utf8") <= 100 + 16);
    assert.strictEqual(buffer.truncated, true);
  });
});
