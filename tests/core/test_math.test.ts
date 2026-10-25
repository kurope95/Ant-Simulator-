import test from "node:test";
import assert from "node:assert/strict";

import { vec, add, neg, scale, dot, cross, length, lengthSq, normalized, perp,
         rotated, fromAngle, angleOf, lerpVec, equals } from "../../src/core/vec2.js";
import { kPi, clamp, wrapAngle, angleDiff, lerp, smoothstep } from "../../src/core/math.js";
import { contains, intersects, expanded } from "../../src/core/rect.js";
import { rgb } from "../../src/core/color.js";

function near(actual: number, expected: number, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);
}

test("vec2: arithmetic and helpers", () => {
  assert.deepEqual(add(vec(1, 2), vec(3, 4)), vec(4, 6));
  assert.deepEqual(scale(vec(1, 2), 2), vec(2, 4));
  assert.deepEqual(neg(vec(1, -2)), vec(-1, 2));
  near(length(vec(3, 4)), 5);
  near(lengthSq(vec(3, 4)), 25);
  near(dot(vec(1, 2), vec(3, 4)), 11);
  near(cross(vec(1, 0), vec(0, 1)), 1);
  assert.deepEqual(normalized(vec(0, 0)), vec(0, 0));
  near(normalized(vec(10, 0)).x, 1);
  const p = perp(vec(1, 0));
  near(p.x, 0);
  near(p.y, 1);
  near(rotated(vec(1, 0), kPi / 2).x, 0);
  near(rotated(vec(1, 0), kPi / 2).y, 1);
  near(fromAngle(0).x, 1);
  near(angleOf(vec(0, 1)), kPi / 2);
  assert.deepEqual(lerpVec(vec(0, 0), vec(10, 20), 0.25), vec(2.5, 5));
  assert.ok(equals(vec(1, 2), vec(1, 2)));
  assert.ok(!equals(vec(1, 2), vec(1, 3)));
});

test("math: angles wrap into (-pi, pi]", () => {
  near(wrapAngle(3 * kPi), kPi);
  near(wrapAngle(-kPi), kPi);
  near(wrapAngle(-1.5 * kPi), 0.5 * kPi);
  near(wrapAngle(0.25), 0.25);
  near(angleDiff(0.1, -0.1), -0.2);
  near(angleDiff(kPi - 0.1, -kPi + 0.1), 0.2);
});

test("math: scalar helpers", () => {
  near(lerp(2, 4, 0.5), 3);
  assert.equal(smoothstep(-1), 0);
  near(smoothstep(0.5), 0.5);
  assert.equal(smoothstep(2), 1);
  assert.equal(clamp(5, 0, 1), 1);
});

test("rect and colour helpers", () => {
  const r = { min: vec(0, 0), max: vec(10, 5) };
  assert.ok(contains(r, vec(10, 5)));
  assert.ok(!contains(r, vec(10.1, 1)));
  assert.ok(intersects(r, { min: vec(9, 4), max: vec(20, 20) }));
  assert.ok(!intersects(r, { min: vec(11, 0), max: vec(20, 5) }));
  assert.deepEqual(expanded(r, 2), { min: vec(-2, -2), max: vec(12, 7) });
  const c = rgb(0xE8DCC2);
  assert.equal(c.r, 0xe8);
  assert.equal(c.g, 0xdc);
  assert.equal(c.b, 0xc2);
  assert.equal(c.a, 255);
});
