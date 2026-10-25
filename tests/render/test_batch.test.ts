import test from "node:test";
import assert from "node:assert/strict";

import { GeometryBatch } from "../../src/render/batch.js";

function near(actual: number, expected: number, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);
}

test("batch: quads and rects share the 0-1-2 / 0-2-3 index pattern", () => {
  const b = new GeometryBatch();
  b.addQuad({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
            { r: 255, g: 0, b: 128, a: 255 });
  b.addRect({ x: 20, y: 20 }, { x: 30, y: 40 }, { r: 0, g: 0, b: 0, a: 255 });
  assert.equal(b.vertexCount(), 8);
  assert.equal(b.indexCount(), 12);
  assert.deepEqual([...b.indices()], [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  near(b.vertexData()[2], 1);
  near(b.vertexData()[4], 128 / 255);
  near(b.vertexData()[5 * 6 + 0], 30);
  near(b.vertexData()[5 * 6 + 1], 20);
  near(b.vertexData()[6 * 6 + 1], 40);
  b.clear();
  assert.equal(b.vertexCount(), 0);
  assert.equal(b.indexCount(), 0);
});

test("batch: lines become quads of the requested width; zero length adds nothing", () => {
  const b = new GeometryBatch();
  b.addLine({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, { r: 0, g: 0, b: 0, a: 255 });
  assert.equal(b.vertexCount(), 4);
  const v = b.vertexData();
  near(v[1], -1);
  near(v[6 + 0], 10);
  near(v[6 + 1], -1);
  near(v[12 + 1], 1);
  near(v[18 + 0], 0);
  near(v[18 + 1], 1);
  b.addLine({ x: 5, y: 5 }, { x: 5, y: 5 }, 2, { r: 0, g: 0, b: 0, a: 255 });
  assert.equal(b.vertexCount(), 4);
});

test("batch: circles are triangle fans starting at angle 0", () => {
  const b = new GeometryBatch();
  b.addCircle({ x: 100, y: 100 }, 10, { r: 0, g: 0, b: 0, a: 255 }, 24);
  assert.equal(b.vertexCount(), 25);
  assert.equal(b.indexCount(), 72);
  near(b.vertexData()[0], 100);
  near(b.vertexData()[6 + 0], 110);
  near(b.vertexData()[6 + 1], 100);
});
