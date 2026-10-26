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

function bruteNearest(
  xs: Float32Array,
  ys: Float32Array,
  count: number,
  x: number,
  y: number,
  radius: number,
  exclude: number,
  k: number,
): number[] {
  const candidates: { i: number; d2: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (i === exclude) continue;
    const dx = xs[i] - x;
    const dy = ys[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= radius * radius) candidates.push({ i, d2 });
  }
  candidates.sort((a, b) => a.d2 - b.d2 || a.i - b.i);
  return candidates.slice(0, k).map((c) => c.i);
}

test("spatial hash: queryWithin lists exactly the brute-force neighbours", () => {
  const count = 2000;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    xs[i] = fraction(31, i, 7, 3) * 1920;
    ys[i] = fraction(32, i, 7, 3) * 1080;
  }
  const hash = new SpatialHash();
  hash.build(xs, ys, count, { x: 1920, y: 1080 }, 6);
  const out = new Uint32Array(count);
  for (let query = 0; query < 20; query++) {
    const x = fraction(41, query, 9, 5) * 1920;
    const y = fraction(42, query, 9, 5) * 1080;
    const radius = 1 + fraction(43, query, 9, 5) * 60;
    const found = hash.queryWithin(x, y, radius, xs, ys, query, out);
    const got = Array.from(out.subarray(0, found)).sort((a, b) => a - b);
    const expected = bruteNearest(xs, ys, count, x, y, radius, query, count);
    assert.deepEqual(got, expected.sort((a, b) => a - b), `query ${query}`);
  }
});

test("spatial hash: queryWithin stops at the length of out", () => {
  const xs = new Float32Array([10, 10.5, 10.2, 10.7, 10.1]);
  const ys = new Float32Array([10, 10.5, 10.2, 10.7, 10.1]);
  const hash = new SpatialHash();
  hash.build(xs, ys, 5, { x: 200, y: 200 }, 6);
  const out = new Uint32Array(2);
  assert.equal(hash.queryWithin(10, 10, 5, xs, ys, 0, out), 2);
});

test("spatial hash: nearestWithin returns the brute-force k nearest, ties included", () => {
  const count = 2000;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    xs[i] = fraction(51, i, 7, 3) * 1920;
    ys[i] = fraction(52, i, 7, 3) * 1080;
  }
  // Duplicate a few positions so distance ties really occur.
  for (let i = 1; i < 40; i++) {
    xs[i * 3] = xs[i * 3 - 3];
    ys[i * 3] = ys[i * 3 - 3];
  }
  const hash = new SpatialHash();
  hash.build(xs, ys, count, { x: 1920, y: 1080 }, 6);
  const outIdx = new Uint32Array(16);
  const outD2 = new Float32Array(16);
  for (let query = 0; query < 40; query++) {
    const x = fraction(61, query, 9, 5) * 1920;
    const y = fraction(62, query, 9, 5) * 1080;
    const radius = 5 + fraction(63, query, 9, 5) * 80;
    const k = 1 + (query % 16);
    const kept = hash.nearestWithin(x, y, radius, xs, ys, query, k, outIdx, outD2);
    const expected = bruteNearest(xs, ys, count, x, y, radius, query, k);
    assert.equal(kept, expected.length, `query ${query} count`);
    assert.deepEqual(Array.from(outIdx.subarray(0, kept)), expected, `query ${query} order`);
    for (let m = 1; m < kept; m++) assert.ok(outD2[m - 1] <= outD2[m], "sorted by distance");
  }
});

test("spatial hash: nearest and within respect exclude and the requested k", () => {
  const xs = new Float32Array([10, 11, 12, 13]);
  const ys = new Float32Array([10, 10, 10, 10]);
  const hash = new SpatialHash();
  hash.build(xs, ys, 4, { x: 200, y: 200 }, 6);
  const outIdx = new Uint32Array(8);
  const outD2 = new Float32Array(8);
  const kept = hash.nearestWithin(10, 10, 10, xs, ys, 0, 2, outIdx, outD2);
  assert.equal(kept, 2);
  assert.deepEqual(Array.from(outIdx.subarray(0, 2)), [1, 2]);
  assert.equal(outD2[0], 1);
  assert.equal(outD2[1], 4);
  assert.equal(hash.nearestWithin(10, 10, 10, xs, ys, 0, 0, outIdx, outD2), 0);
});
