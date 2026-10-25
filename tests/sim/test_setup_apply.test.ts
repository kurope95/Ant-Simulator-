import test from "node:test";
import assert from "node:assert/strict";
import { worldChecksum } from "../../src/sim/checksum.js";
import { lineOfSight, obstacleGridFromCells } from "../../src/sim/obstacles.js";
import { defaultParams } from "../../src/sim/params.js";
import { loadPreset } from "../../src/sim/presets.js";
import { addColony, addFood, FoodKind, makeSetup, type WorldSetup } from "../../src/sim/setup.js";
import { paramsForSetup, worldFromSetup } from "../../src/sim/setup_apply.js";
import { AntState } from "../../src/sim/types.js";
import { applyBreach, stepWorld } from "../../src/sim/world.js";

function twoColonySetup(): WorldSetup {
  const setup = makeSetup({ x: 400, y: 300 }, 7, "test");
  addColony(setup, { x: 60, y: 60 }, 0, 20);
  addColony(setup, { x: 340, y: 240 }, 2, 30);
  addFood(setup, { x: 200, y: 150 }, 1000, FoodKind.Berries);
  return setup;
}

test("setup apply: builds colonies, food, ants and the matching size", () => {
  const setup = twoColonySetup();
  const world = worldFromSetup(setup, defaultParams());
  assert.deepEqual(world.size, { x: 400, y: 300 });
  assert.equal(world.params.worldW, 400);
  assert.equal(world.obstacles.width, 100);
  assert.equal(world.colonies.length, 2);
  assert.deepEqual(world.colonies.map((c) => [c.id, c.color, c.population]), [[0, 0, 20], [1, 2, 30]]);
  assert.equal(world.ants.size(), 50);
  assert.equal(world.food.items[0].uid, 1);
  assert.equal(world.food.items[0].kind, FoodKind.Berries);
});

test("setup apply: a preview world has colonies but no ants", () => {
  const world = worldFromSetup(twoColonySetup(), defaultParams(), { spawnAnts: false });
  assert.equal(world.ants.size(), 0);
  assert.equal(world.colonies[0].population, 0);
  assert.equal(world.colonies.length, 2);
});

test("setup apply: colonies deliver only to their own nest", () => {
  const world = worldFromSetup(twoColonySetup(), defaultParams());
  let index = -1;
  for (let i = 0; i < world.ants.size(); i++) if (world.ants.colony[i] === 1) { index = i; break; }
  const nest = world.colonies[1].nest;
  world.ants.posX[index] = nest.x;
  world.ants.posY[index] = nest.y;
  world.ants.state[index] = AntState.ReturningFood;
  stepWorld(world);
  assert.equal(world.colonies[1].foodPool, 1);
  assert.equal(world.colonies[1].deliveredTotal, 1);
  assert.equal(world.colonies[0].foodPool, 0);
});

test("setup apply: same setup and seed are deterministic after 600 ticks", () => {
  const a = worldFromSetup(twoColonySetup(), defaultParams());
  const b = worldFromSetup(twoColonySetup(), defaultParams());
  for (let i = 0; i < 600; i++) { stepWorld(a); stepWorld(b); }
  assert.equal(worldChecksum(a), worldChecksum(b));
  b.colonies[0].color = 3;
  assert.notEqual(worldChecksum(a), worldChecksum(b));
});

test("setup apply: param overrides reach the world and leave the rest alone", () => {
  const setup = twoColonySetup();
  setup.paramOverrides = { energyBurn: 0.3 };
  const world = worldFromSetup(setup, defaultParams());
  assert.equal(world.params.energyBurn, 0.3);
  assert.equal(world.params.antSpeed, defaultParams().antSpeed);
});

test("setup apply: a scenario's defaults keep its own overrides", () => {
  const maze = loadPreset("maze", 1)!;
  const reset = paramsForSetup(maze, defaultParams());
  assert.equal(reset.energyBurn, 0.2);
  assert.equal(reset.antSpeed, defaultParams().antSpeed);

  const meadow = loadPreset("meadow", 1)!;
  assert.equal(paramsForSetup(meadow, defaultParams()).energyBurn, defaultParams().energyBurn);
});

test("maze: line of sight is blocked before the breach", () => {
  const setup = loadPreset("maze", 1)!;
  const world = worldFromSetup(setup, defaultParams());
  assert.equal(lineOfSight(world.obstacles, world.colonies[0].nest, world.food.items[0].pos), false);
  assert.equal(world.params.energyBurn, 0.2);
});

test("maze: applyBreach clears the shortcut", () => {
  const setup = loadPreset("maze", 1)!;
  const world = worldFromSetup(setup, defaultParams());
  applyBreach(world, setup.breach);
  assert.equal(lineOfSight(world.obstacles, world.colonies[0].nest, world.food.items[0].pos), true);
  const rebuilt = obstacleGridFromCells(world.obstacles);
  assert.deepEqual(world.obstacles.border, rebuilt.border);
  assert.deepEqual(world.obstacles.nearSolid, rebuilt.nearSolid);
});
