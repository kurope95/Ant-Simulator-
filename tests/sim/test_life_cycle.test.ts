import test from "node:test";
import assert from "node:assert/strict";

import type { Vec2 } from "../../src/core/vec2.js";
import { colonyReserve, makeColony } from "../../src/sim/colony.js";
import { defaultParams, type SimParams } from "../../src/sim/params.js";
import { quickStartSetup } from "../../src/sim/presets.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { AntState } from "../../src/sim/types.js";
import { makeWorld, stepWorld, type World } from "../../src/sim/world.js";

function lifeWorld(): { world: World; params: SimParams } {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 400;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 10, y: 10 }));
  return { world, params };
}

function spawnAnt(world: World, pos: Vec2, lifeLeft = 600): number {
  const index = world.ants.spawn({ pos, lifeLeft }, world.nextUid++, world.params.antSpeed, world.params);
  world.colonies[0].population += 1;
  return index;
}

test("life cycle: eating at the nest costs stored food", () => {
  const { world, params } = lifeWorld();
  const index = spawnAnt(world, { x: 10, y: 10 });
  world.ants.energy[index] = 40;
  world.colonies[0].foodPool = 10;
  stepWorld(world);
  assert.equal(world.ants.energy[index], params.energyMax);
  // 60 energy plus one tick of burn, at 0.01 food each.
  const eaten = 10 - world.colonies[0].foodPool;
  assert.ok(Math.abs(eaten - (60 + params.energyBurn / params.simHz) * params.foodPerEnergy) < 1e-4, `ate ${eaten}`);
});

test("life cycle: with empty stores an ant at home gets no meal", () => {
  const { world, params } = lifeWorld();
  const index = spawnAnt(world, { x: 10, y: 10 });
  world.ants.energy[index] = 40;
  stepWorld(world);
  assert.ok(world.ants.energy[index] < 40);
  assert.equal(world.colonies[0].foodPool, 0);
  // Half a meal's worth of food gives half the meal.
  world.colonies[0].foodPool = 0.1;
  const before = world.ants.energy[index];
  stepWorld(world);
  const gained = world.ants.energy[index] - before + params.energyBurn / params.simHz;
  assert.ok(Math.abs(gained - 10) < 1e-3, `gained ${gained}`);
  assert.equal(world.colonies[0].foodPool, 0);
});

test("life cycle: old ants die of age and hungry ants of hunger, counted apart", () => {
  const { world } = lifeWorld();
  spawnAnt(world, { x: 200, y: 200 }, 0.001);
  const hungry = spawnAnt(world, { x: 300, y: 300 });
  world.ants.energy[hungry] = 0.001;
  spawnAnt(world, { x: 100, y: 300 });
  stepWorld(world);
  const colony = world.colonies[0];
  assert.equal(world.ants.size(), 1);
  assert.equal(colony.population, 1);
  assert.equal(colony.diedOfAge, 1);
  assert.equal(colony.diedOfHunger, 1);
});

test("life cycle: off, ants never age and meals are free", () => {
  const { world } = lifeWorld();
  const params = world.params;
  params.lifeCycle = false;
  const index = spawnAnt(world, { x: 10, y: 10 }, 0.001);
  world.ants.energy[index] = 40;
  stepWorld(world);
  assert.equal(world.ants.size(), 1);
  assert.equal(world.ants.energy[index], params.energyMax);
  assert.equal(world.colonies[0].foodPool, 0);
});

test("life cycle: the queen keeps the reserve and lays at a steady rate", () => {
  const { world, params } = lifeWorld();
  for (let i = 0; i < 100; i++) spawnAnt(world, { x: 300, y: 300 });
  const colony = world.colonies[0];
  const reserve = colonyReserve(colony, params);
  assert.ok(Math.abs(reserve - 100 * params.reserveSeconds * params.energyBurn * params.foodPerEnergy) < 1e-9);
  // Food for one egg but not for the reserve: no birth.
  colony.foodPool = params.spawnCost;
  for (let t = 0; t < 120; t++) stepWorld(world);
  assert.equal(colony.born, 0);
  // Plenty of food: births follow the laying rate, not the food.
  colony.foodPool = 10_000;
  for (let t = 0; t < 600; t++) stepWorld(world);
  const rate = params.birthRateBase + params.birthRatePerAnt * 100;
  assert.ok(colony.born >= Math.floor(rate * 10) - 1, `born ${colony.born}`);
  assert.ok(colony.born <= Math.ceil(rate * 10 * 1.1) + params.birthBurst, `born ${colony.born}`);
  assert.ok(colony.foodPool > 10_000 - colony.born * params.spawnCost - 50);
});

test("life cycle: founders start with mixed ages and a stocked pantry", () => {
  const params = defaultParams();
  const world = worldFromSetup(quickStartSetup(7), params);
  const colony = world.colonies[0];
  assert.ok(Math.abs(colony.foodPool - colonyReserve(colony, params)) < 1e-9);
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < world.ants.size(); i++) {
    lo = Math.min(lo, world.ants.lifeLeft[i]);
    hi = Math.max(hi, world.ants.lifeLeft[i]);
    assert.equal(world.ants.state[i], AntState.Foraging);
  }
  const min = params.antLifespan * 0.25 * (1 - params.lifespanJitter);
  const max = params.antLifespan * (1 + params.lifespanJitter);
  assert.ok(lo >= min - 1e-3 && hi <= max + 1e-3, `life left ${lo}..${hi}`);
  assert.ok(hi - lo > params.antLifespan * 0.5, "ages are spread out");
});
