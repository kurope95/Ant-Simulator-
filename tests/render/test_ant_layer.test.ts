import test from "node:test";
import assert from "node:assert/strict";
import { makeAtlasFrames } from "../../src/render/atlas.js";
import { Camera } from "../../src/render/camera.js";
import { buildAnts } from "../../src/render/ant_layer.js";
import { GeometryBatch } from "../../src/render/batch.js";
import { GaitTracker } from "../../src/render/legs.js";
import { SpriteBatch } from "../../src/render/sprite_batch.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld } from "../../src/sim/world.js";

function layerWorld() {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 60, y: 60 }));
  world.ants.spawn({ pos: { x: 200, y: 150 } }, 0, params.antSpeed, params);
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  return { world, camera, params };
}

test("ants: a shadow and a body sprite plus animated legs at fit zoom", () => {
  const { world, camera } = layerWorld();
  const sprites = new SpriteBatch();
  const legs = new GeometryBatch();
  const gait = new GaitTracker();
  gait.update(world);
  buildAnts(sprites, legs, world, camera, 0, makeAtlasFrames(), gait);
  assert.equal(sprites.quadCount(), 2);
  assert.equal(legs.vertexCount(), 48);
});

test("ants: a small frame with baked legs below the threshold", () => {
  const { world, camera } = layerWorld();
  world.params.legsMinPx = 1000;
  const sprites = new SpriteBatch();
  const legs = new GeometryBatch();
  const gait = new GaitTracker();
  gait.update(world);
  buildAnts(sprites, legs, world, camera, 0, makeAtlasFrames(), gait);
  assert.equal(sprites.quadCount(), 2);
  assert.equal(legs.vertexCount(), 0);
});

test("ants: off-screen ants are culled and extreme scales stay finite", () => {
  const { world, camera } = layerWorld();
  world.ants.posX[0] = 2000;
  world.ants.posY[0] = 2000;
  world.ants.prevX[0] = 2000;
  world.ants.prevY[0] = 2000;
  const sprites = new SpriteBatch();
  const legs = new GeometryBatch();
  const gait = new GaitTracker();
  gait.update(world);
  buildAnts(sprites, legs, world, camera, 0.5, makeAtlasFrames(), gait);
  assert.equal(sprites.quadCount(), 0);
  world.ants.posX[0] = 200;
  world.ants.posY[0] = 150;
  world.ants.prevX[0] = 200;
  world.ants.prevY[0] = 150;
  camera.setViewport({ x: 0, y: 0 });
  camera.fit(world.size);
  buildAnts(sprites, legs, world, camera, 0.5, makeAtlasFrames(), gait);
  for (const v of sprites.vertexData()) assert.ok(Number.isFinite(v));
  for (const v of legs.vertexData()) assert.ok(Number.isFinite(v));
});

test("ants: body interpolation uses the alpha between prev and pos", () => {
  const { world, camera } = layerWorld();
  world.ants.prevX[0] = 100;
  world.ants.posX[0] = 110;
  world.ants.prevY[0] = 100;
  world.ants.posY[0] = 100;
  world.ants.heading[0] = 0;
  const sprites = new SpriteBatch();
  const gait = new GaitTracker();
  gait.update(world);
  buildAnts(sprites, new GeometryBatch(), world, camera, 0.5, makeAtlasFrames(), gait);
  const data = sprites.vertexData();
  const expectedX = camera.worldToScreen({ x: 105, y: 100 }).x;
  let sumX = 0;
  for (let v = 0; v < 4; v++) sumX += data[32 + v * 8]; // second quad = body
  assert.ok(Math.abs(sumX / 4 - expectedX) < 1e-6);
});
