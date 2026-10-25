import test from "node:test";
import assert from "node:assert/strict";

import { GeometryBatch } from "../../src/render/batch.js";
import { Camera } from "../../src/render/camera.js";
import { buildTestPattern, testPatternDot } from "../../src/render/test_pattern.js";
import { sandTheme, colonyColor } from "../../src/render/theme.js";

function near(actual: number, expected: number, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);
}

test("theme: sand palette and colony colours", () => {
  const t = sandTheme();
  assert.equal(t.ground.r, 0xe8);
  assert.equal(t.ground.g, 0xdc);
  assert.equal(t.ground.b, 0xc2);
  assert.equal(t.outside.r, 0x2b);
  assert.equal(colonyColor(0).r, 0xe0);
  assert.equal(colonyColor(1).g, 0xc1);
  assert.equal(colonyColor(2).b, 0xe0);
  assert.equal(colonyColor(3).g, 0xaa);
  assert.equal(colonyColor(8).r, colonyColor(0).r);
});

test("test pattern: the dot turns a quarter circle per second (y points down)", () => {
  const world = { x: 1920, y: 1080 };
  const p0 = testPatternDot(world, 0);
  near(p0.x, 1160);
  near(p0.y, 540);
  const p1 = testPatternDot(world, 1);
  near(p1.x, 960);
  near(p1.y, 740);
});

test("test pattern: draws for a fitted camera", () => {
  const cam = new Camera();
  cam.setViewport({ x: 1920, y: 1080 });
  cam.fit({ x: 1920, y: 1080 });
  const b = new GeometryBatch();
  buildTestPattern(b, cam, { x: 1920, y: 1080 }, sandTheme(), 0);
  assert.ok(b.vertexCount() > 100);
});
