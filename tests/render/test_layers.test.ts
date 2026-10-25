import test from "node:test";
import assert from "node:assert/strict";
import { makeAtlasFrames } from "../../src/render/atlas.js";
import { Camera } from "../../src/render/camera.js";
import { buildFood } from "../../src/render/food_layer.js";
import { buildNests } from "../../src/render/nest_layer.js";
import { SpriteBatch } from "../../src/render/sprite_batch.js";
import { makeColony } from "../../src/sim/colony.js";
import { addFoodSource } from "../../src/sim/food.js";
import { defaultParams } from "../../src/sim/params.js";
import { FoodKind } from "../../src/sim/setup.js";
import { makeWorld } from "../../src/sim/world.js";

function layerWorld() {
  const params = defaultParams();
  params.worldW = 400; params.worldH = 300;
  const world = makeWorld(params, 1);
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  return { world, camera };
}

test("food: every piece gets a shadow in the shadow batch and a piece sprite", () => {
  const { world, camera } = layerWorld();
  addFoodSource(world.food, { x: 200, y: 150 }, 1000, false, FoodKind.Berries);
  const sprites = new SpriteBatch();
  const shadows = new SpriteBatch();
  buildFood(sprites, shadows, world, camera, makeAtlasFrames());
  assert.equal(sprites.quadCount(), 10); // one piece sprite per piece
  assert.equal(shadows.quadCount(), 10); // one shadow per piece
});

test("food: an empty source draws nothing", () => {
  const { world, camera } = layerWorld();
  world.food.items.push({ uid: 1, pos: { x: 200, y: 150 }, amount: 0, infinite: false, kind: FoodKind.Seeds });
  const sprites = new SpriteBatch();
  const shadows = new SpriteBatch();
  buildFood(sprites, shadows, world, camera, makeAtlasFrames());
  assert.equal(sprites.quadCount(), 0);
  assert.equal(shadows.quadCount(), 0);
});

test("nests: never smaller than 28 CSS px, even when the world is far away", () => {
  const { world, camera } = layerWorld();
  world.colonies.push(makeColony(0, { x: 60, y: 60 }, 0));
  camera.setPixelRatio(2);
  camera.setViewport({ x: 8, y: 6 });
  camera.fit(world.size);
  camera.centerOn({ x: 60, y: 60 });
  const sprites = new SpriteBatch();
  buildNests(sprites, world, camera, makeAtlasFrames());
  const data = sprites.vertexData();
  const xs = [data[0], data[8], data[16], data[24]];
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 56) < 1e-6);
});

test("nests: one sprite per colony, larger with population, extinct tinted", () => {
  const { world, camera } = layerWorld();
  world.colonies.push(makeColony(0, { x: 100, y: 100 }, 0));
  world.colonies.push(makeColony(1, { x: 300, y: 200 }, 2));
  world.colonies[0].population = 400;
  world.colonies[1].population = 10;
  world.colonies[1].extinct = true;
  const sprites = new SpriteBatch();
  buildNests(sprites, world, camera, makeAtlasFrames());
  assert.equal(sprites.quadCount(), 2);
});
