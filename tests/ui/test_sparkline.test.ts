import test from "node:test";
import assert from "node:assert/strict";

import { sparklinePath } from "../../src/ui/sparkline.js";

function points(path: string): number[][] {
  return path
    .split(/[ML]/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => part.split(" ").map(Number));
}

test("sparkline: an empty series draws nothing", () => {
  assert.equal(sparklinePath([], 100, 20), "");
});

test("sparkline: one point and a flat series draw a mid-height line", () => {
  assert.equal(sparklinePath([5], 100, 20), "M 2 10 L 98 10");
  assert.equal(sparklinePath([0, 0, 0], 100, 20), "M 2 10 L 98 10");
  assert.equal(sparklinePath([7, 7], 100, 20), "M 2 10 L 98 10");
});

test("sparkline: two points run from the left edge to the right edge", () => {
  const pts = points(sparklinePath([0, 10], 100, 20));
  assert.deepEqual(pts, [
    [2, 18],
    [98, 2],
  ]);
});

test("sparkline: a hundred points stay inside the box and keep their order", () => {
  const values = Array.from({ length: 100 }, (_, i) => Math.sin(i / 7) * 40 + 60);
  const pts = points(sparklinePath(values, 120, 30));
  assert.equal(pts.length, 100);
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    assert.ok(x >= 2 && x <= 118, `x ${x} outside the box`);
    assert.ok(y >= 2 && y <= 28, `y ${y} outside the box`);
    if (i > 0) assert.ok(x > pts[i - 1][0], "x must increase");
  }
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  assert.equal(minY, 2);
  assert.equal(maxY, 28);
});
