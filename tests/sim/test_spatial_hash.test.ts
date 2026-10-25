import test from "node:test";
import assert from "node:assert/strict";

import { randU32 } from "../../src/core/rng.js";
import { SpatialHash } from "../../src/sim/spatial_hash.js";

function fraction(seed: number, uid: number, tick: number, stream: number): number {
  return randU32(seed, uid, tick, stream) / 2 ** 32;
}

function bruteForce(
  xs: Float32Array,
  ys: Float32Array,
  count: number,
  x: number,
  y: number,
  radius: number,
  exclude: number,
): number {
  let found = 0;
  for (let i = 0; i < count; i++) {
    if (i === exclude) continue;
    const dx = xs[i] - x;
    const dy = ys[i] - y;
    if (dx * dx + dy * dy <= radius * radius) found += 1;
  }
  return found;
}

test("spatial hash: counts match brute force", () => {
  const count = 2000;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    xs[i] = fraction(11, i, 7, 3) * 1920;
    ys[i] = fraction(12, i, 7, 3) * 1080;
  }
  const hash = new SpatialHash();
  hash.build(xs, ys, count, { x: 1920, y: 1080 }, 6);
  for (let query = 0; query < 200; query++) {
    const x = fraction(21, query, 9, 5) * 1920;
    const y = fraction(22, query, 9, 5) * 1080;
    const radius = 1 + fraction(23, query, 9, 5) * 60;
    const expected = bruteForce(xs, ys, count, x, y, radius, query);
    assert.equal(
      hash.countWithin(x, y, radius, xs, ys, query),
      expected,
      `query ${query} at ${x.toFixed(1)},${y.toFixed(1)} r=${radius.toFixed(1)}`,
    );
  }
});

test("spatial hash: a rebuild forgets ants that are gone", () => {
  const xs = new Float32Array([10, 10.5, 10.2, 10.7]);
  const ys = new Float32Array([10, 10.5, 10.2, 10.7]);
  const hash = new SpatialHash();
  hash.build(xs, ys, 4, { x: 200, y: 200 }, 6);
  assert.equal(hash.countWithin(10, 10, 5, xs, ys, -1), 4);
  hash.build(xs, ys, 2, { x: 200, y: 200 }, 6);
  assert.equal(hash.countWithin(10, 10, 5, xs, ys, -1), 2);
  hash.build(xs, ys, 0, { x: 200, y: 200 }, 6);
  assert.equal(hash.countWithin(10, 10, 5, xs, ys, -1), 0);
});
