import test from "node:test";
import assert from "node:assert/strict";

import { mix32, randU32, randUnit, randRange } from "../../src/core/rng.js";

function near(actual: number, expected: number, eps: number) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);
}

test("rng: golden values pin the algorithm", () => {
  assert.equal(mix32(0), 0);
  assert.equal(mix32(1), 1753845952);
  assert.equal(randU32(1, 2, 3, 4), 2399904952);
  assert.equal(randU32(0, 0, 0, 0), 1106484830);
  assert.equal(randU32(42, 7, 1000, 1), 4204954830);
  near(randUnit(1, 2, 3, 4), 0.5587714146822691, 1e-12);
});

test("rng: same inputs repeat, any changed input changes the value", () => {
  const base = randU32(5, 6, 7, 8);
  assert.equal(randU32(5, 6, 7, 8), base);
  assert.notEqual(randU32(6, 6, 7, 8), base);
  assert.notEqual(randU32(5, 7, 7, 8), base);
  assert.notEqual(randU32(5, 6, 8, 8), base);
  assert.notEqual(randU32(5, 6, 7, 9), base);
});

test("rng: randUnit is uniform in [0, 1)", () => {
  let sum = 0;
  let lo = 1;
  let hi = 0;
  for (let t = 0; t < 100_000; t++) {
    const u = randUnit(9, 1, t, 3);
    sum += u;
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
  }
  assert.ok(lo >= 0);
  assert.ok(hi < 1);
  near(sum / 100_000, 0.5, 0.01);
});

test("rng: randRange stays inside [lo, hi)", () => {
  let lo = 1;
  let hi = -1;
  for (let t = 0; t < 10_000; t++) {
    const v = randRange(3, 4, t, 5, -0.6, 0.6);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(lo >= -0.6);
  assert.ok(hi < 0.6);
});
