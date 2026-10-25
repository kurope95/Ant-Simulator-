import test from "node:test";
import assert from "node:assert/strict";
import { makeAtlasFrames } from "../../src/render/atlas.js";
import { SpriteBatch } from "../../src/render/sprite_batch.js";
import { FoodKind } from "../../src/sim/setup.js";
import { rgba } from "../../src/core/color.js";

const white = rgba(255, 255, 255, 255);

test("sprite batch: one frame writes four vertices and six indices with its UVs", () => {
  const batch = new SpriteBatch();
  batch.addFrame(makeAtlasFrames().food(FoodKind.Seeds, 0), 256, 256, 64, 64, 0, white);
  assert.equal(batch.quadCount(), 1);
  assert.equal(batch.vertexCount(), 4);
  assert.equal(batch.indexCount(), 6);
  assert.deepEqual([...batch.indices()], [0, 1, 2, 0, 2, 3]);
  const data = batch.vertexData();
  assert.equal(data.length, 32);
  assert.deepEqual([...data.slice(0, 2)], [224, 224]);
  assert.deepEqual([...data.slice(8, 10)], [288, 224]);
  assert.ok(Math.abs(data[2] - 0) < 1e-6);
  assert.ok(Math.abs(data[3] - 128 / 1024) < 1e-6);
  assert.ok(Math.abs(data[10] - 64 / 2048) < 1e-6);
});

test("sprite batch: rotation keeps the centre and stays finite", () => {
  const batch = new SpriteBatch();
  batch.addFrame(makeAtlasFrames().nest(0), 100, 100, 40, 40, Math.PI / 2, white);
  const data = batch.vertexData();
  for (const value of data) assert.ok(Number.isFinite(value));
  let sumX = 0, sumY = 0;
  for (let v = 0; v < 4; v++) { sumX += data[v * 8]; sumY += data[v * 8 + 1]; }
  assert.ok(Math.abs(sumX / 4 - 100) < 1e-6);
  assert.ok(Math.abs(sumY / 4 - 100) < 1e-6);
});

test("sprite batch: clear resets the counts and tints are copied", () => {
  const batch = new SpriteBatch();
  batch.addFrame(makeAtlasFrames().food(FoodKind.Berries, 1), 0, 0, 10, 10, 0, rgba(10, 20, 30, 40));
  batch.clear();
  assert.equal(batch.quadCount(), 0);
  assert.equal(batch.vertexData().length, 0);
  batch.addFrame(makeAtlasFrames().food(FoodKind.Berries, 1), 0, 0, 10, 10, 0, rgba(10, 20, 30, 40));
  const data = batch.vertexData();
  assert.ok(Math.abs(data[4] - 10 / 255) < 1e-6);
  assert.ok(Math.abs(data[7] - 40 / 255) < 1e-6);
});
