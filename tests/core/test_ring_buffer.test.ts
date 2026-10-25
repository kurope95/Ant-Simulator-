import test from "node:test";
import assert from "node:assert/strict";

import { RingBuffer } from "../../src/core/ring_buffer.js";

test("ring buffer: keeps the newest values in order", () => {
  const ring = new RingBuffer<number>(3);
  assert.equal(ring.size(), 0);
  ring.push(1);
  ring.push(2);
  assert.equal(ring.size(), 2);
  assert.equal(ring.get(0), 1);
  ring.push(3);
  ring.push(4);
  assert.equal(ring.size(), 3);
  assert.equal(ring.get(0), 2);
  assert.equal(ring.get(1), 3);
  assert.equal(ring.get(2), 4);
});

test("ring buffer: get rejects an index outside the stored range", () => {
  const ring = new RingBuffer<string>(2);
  assert.throws(() => ring.get(0), RangeError);
  ring.push("a");
  assert.equal(ring.get(0), "a");
  assert.throws(() => ring.get(1), RangeError);
  assert.throws(() => ring.get(-1), RangeError);
});

test("ring buffer: capacity must be at least 1", () => {
  assert.throws(() => new RingBuffer<number>(0), RangeError);
});
