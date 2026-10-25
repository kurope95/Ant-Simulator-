import test from "node:test";
import assert from "node:assert/strict";

import { GeometryBatch } from "../../src/render/batch.js";
import { Camera } from "../../src/render/camera.js";
import { buildAnts } from "../../src/render/ant_layer.js";
import { colonyColor, nightTheme } from "../../src/render/theme.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld, type World } from "../../src/sim/world.js";

function makeLayerWorld(): { world: World; camera: Camera } {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 60, y: 60 }));
  world.ants.spawn({ pos: { x: 100, y: 100 } }, 0, world.params.antSpeed, world.params);
  world.ants.spawn({ pos: { x: 120, y: 100 } }, 1, world.params.antSpeed, world.params);
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  return { world, camera };
}

test("ants: one body quad per visible ant in its colony colour", () => {
  const { world, camera } = makeLayerWorld();
  const batch = new GeometryBatch();
  buildAnts(batch, world, camera, 0, nightTheme());
  assert.equal(batch.vertexCount(), 8);
  assert.equal(batch.indexCount(), 12);
  const color = colonyColor(0);
  assert.ok(Math.abs(batch.vertexData()[2] - color.r / 255) < 1e-6);
});

test("ants: off-screen ants are culled and a zero viewport stays finite", () => {
  const { world, camera } = makeLayerWorld();
  for (const index of [0, 1]) {
    world.ants.posX[index] = 2000;
    world.ants.prevX[index] = 2000;
    world.ants.posY[index] = 2000;
    world.ants.prevY[index] = 2000;
  }
  const batch = new GeometryBatch();
  buildAnts(batch, world, camera, 0.5, nightTheme());
  assert.equal(batch.indexCount(), 0);
  world.ants.posX[0] = 200;
  world.ants.posY[0] = 150;
  world.ants.prevX[0] = 200;
  world.ants.prevY[0] = 150;
  world.ants.posX[1] = 2000;
  world.ants.posY[1] = 2000;
  const zero = new Camera();
  zero.setViewport({ x: 0, y: 0 });
  zero.fit(world.size);
  buildAnts(batch, world, zero, 0.5, nightTheme());
  assert.ok(batch.vertexCount() > 0);
  for (const value of batch.vertexData()) assert.ok(Number.isFinite(value));
});

test("ants: alpha interpolates between prev and pos without NaN", () => {
  const { world, camera } = makeLayerWorld();
  world.ants.prevX[0] = 100;
  world.ants.posX[0] = 110;
  world.ants.prevY[0] = 100;
  world.ants.posY[0] = 100;
  world.ants.heading[0] = 0;
  world.ants.posX[1] = 2000;
  world.ants.posY[1] = 2000;
  const batch = new GeometryBatch();
  buildAnts(batch, world, camera, 0.5, nightTheme());
  const data = batch.vertexData();
  for (const value of data) assert.ok(Number.isFinite(value));
  const expectedX = camera.worldToScreen({ x: 105, y: 100 }).x;
  let sumX = 0;
  for (let vertex = 0; vertex < 4; vertex++) sumX += data[vertex * 6];
  assert.ok(Math.abs(sumX / 4 - expectedX) < 1e-6);
});
