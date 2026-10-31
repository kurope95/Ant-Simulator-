import test from "node:test";
import assert from "node:assert/strict";

import type { Vec2 } from "../../src/core/vec2.js";
import { makeColony, nestRadius } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { pickAnt } from "../../src/sim/picking.js";
import { layingFactor, startResting } from "../../src/sim/tick.js";
import { AntState } from "../../src/sim/types.js";
import { makeWorld, stepWorld, type World } from "../../src/sim/world.js";

function restWorld(): World {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 400;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  params.scoutRate = 0;
  const world = makeWorld(params, 5);
  world.colonies.push(makeColony(0, { x: 200, y: 200 }));
  return world;
}

function addAnt(world: World, pos: Vec2, state = AntState.Foraging): number {
  const index = world.ants.spawn({ pos, state }, world.nextUid++, world.params.antSpeed, world.params);
  world.colonies[0].population += 1;
  return index;
}

test("resting: a worker that comes home tired and empty-handed rests, out of sight", () => {
  const world = restWorld();
  const colony = world.colonies[0];
  const ant = addAnt(world, { x: 200, y: 200 }, AntState.ReturningExhausted);
  world.ants.energy[ant] = 50;
  colony.foodPool = 10;
  stepWorld(world);
  assert.equal(world.ants.state[ant], AntState.Resting);
  assert.equal(colony.resting, 1);
  assert.deepEqual([world.ants.posX[ant], world.ants.posY[ant]], [200, 200]);
  assert.equal(pickAnt(world, 200, 200, 30), -1, "a resting ant cannot be clicked");
  // It stays put while nothing calls it.
  for (let t = 0; t < 120; t++) stepWorld(world);
  assert.equal(world.ants.state[ant], AntState.Resting);
  assert.deepEqual([world.ants.posX[ant], world.ants.posY[ant]], [200, 200]);
});

test("resting: a resting ant burns a quarter as fast and eats from the stores", () => {
  const world = restWorld();
  const colony = world.colonies[0];
  const ant = addAnt(world, { x: 200, y: 200 });
  startResting(world, colony, ant);
  world.ants.energy[ant] = 95;
  stepWorld(world);
  const params = world.params;
  const burned = 95 - world.ants.energy[ant];
  assert.ok(Math.abs(burned - (params.energyBurn * params.restBurnFactor) / params.simHz) < 1e-4, `burned ${burned}`);
  world.ants.energy[ant] = 50;
  colony.foodPool = 10;
  stepWorld(world);
  assert.equal(world.ants.energy[ant], params.energyMax, "a hungry resting ant eats");
  assert.ok(colony.foodPool < 10);
});

test("resting: each delivery calls one resting ant out, the longest resting first", () => {
  const world = restWorld();
  const colony = world.colonies[0];
  const first = addAnt(world, { x: 200, y: 200 });
  const second = addAnt(world, { x: 200, y: 200 });
  startResting(world, colony, first);
  startResting(world, colony, second);
  const firstUid = world.ants.uid[first];
  const carrier = addAnt(world, { x: 200, y: 200 }, AntState.ReturningFood);
  world.ants.richFind[carrier] = 1; // back from a rich pile
  stepWorld(world);
  assert.equal(colony.deliveredTotal, 1);
  assert.equal(colony.resting, 1);
  const out = world.ants.indexOf(firstUid)!;
  assert.equal(world.ants.state[out], AntState.Foraging);
  const dist = Math.hypot(world.ants.posX[out] - 200, world.ants.posY[out] - 200);
  assert.ok(dist > nestRadius(colony, world.params) * 0.5, `left from the rim, ${dist} u out`);
  assert.equal(world.ants.state[carrier], AntState.Foraging);
});

test("resting: scouts trickle out at scoutRate of the resting ants", () => {
  const world = restWorld();
  const colony = world.colonies[0];
  for (let i = 0; i < 100; i++) startResting(world, colony, addAnt(world, { x: 200, y: 200 }));
  colony.foodPool = 1000;
  world.params.scoutRate = 0.01; // 1 of 100 per second
  for (let t = 0; t < 10 * world.params.simHz; t++) stepWorld(world);
  const out = 100 - colony.resting;
  assert.ok(out >= 9 && out <= 11, `${out} scouts in 10 s`);
});

test("resting: the queen lays by the food coming in per ant", () => {
  const params = defaultParams();
  const colony = makeColony(0, { x: 0, y: 0 });
  colony.population = 100;
  colony.resting = 50; // a crowded nest, so only the income counts here
  colony.incomePerMinute = 100 * params.layIncomeFull;
  assert.equal(layingFactor(colony, params), 1);
  colony.incomePerMinute = 100 * ((params.layIncomeNone + params.layIncomeFull) / 2);
  const half = layingFactor(colony, params);
  assert.ok(half > 0.45 && half < 0.55, `half way: ${half}`);
  colony.incomePerMinute = 100 * params.layIncomeNone;
  assert.equal(layingFactor(colony, params), 0);
  params.restAtHome = false;
  assert.equal(layingFactor(colony, params), 1);
});

test("resting: an empty nest makes the queen lay even when food per ant is low", () => {
  const params = defaultParams();
  const colony = makeColony(0, { x: 0, y: 0 });
  colony.population = 100;
  colony.incomePerMinute = 0; // far food: long trips, little per ant
  colony.resting = 2;
  assert.equal(layingFactor(colony, params), 1, "nearly everyone is out working");
  colony.resting = Math.round(params.layEmptyUntil * 100);
  assert.equal(layingFactor(colony, params), 0, "a crowded nest and no income: no eggs");
});

test("resting: the queen's income signal follows deliveries over about a minute", () => {
  const world = restWorld();
  const colony = world.colonies[0];
  colony.incomePerMinute = 0;
  // One delivery every second for two minutes: income heads to 60 a minute.
  for (let s = 0; s < 120; s++) {
    const carrier = addAnt(world, { x: 200, y: 200 }, AntState.ReturningFood);
    for (let t = 0; t < world.params.simHz; t++) stepWorld(world);
    // Out of the way, far from the nest (dying would leave a body some forager could deliver).
    const done = world.ants.indexOf(world.ants.uid[carrier])!;
    world.ants.posX[done] = 390;
    world.ants.posY[done] = 390;
    world.ants.lifeLeft[done] = 1e9;
  }
  assert.ok(colony.incomePerMinute > 45 && colony.incomePerMinute < 62, `income ${colony.incomePerMinute}`);
});

test("resting: newborns start in the nest; a resting ant that dies leaves the count", () => {
  const world = restWorld();
  const colony = world.colonies[0];
  for (let i = 0; i < 20; i++) addAnt(world, { x: 50 + i, y: 50 });
  colony.foodPool = 500;
  colony.incomePerMinute = 20 * world.params.layIncomeFull; // a well-fed colony: the queen lays
  for (let t = 0; t < 60; t++) stepWorld(world);
  assert.ok(colony.born > 0);
  assert.equal(colony.resting, colony.born);
  const resting = [];
  for (let i = 0; i < world.ants.size(); i++) if (world.ants.state[i] === AntState.Resting) resting.push(i);
  assert.equal(resting.length, colony.resting);
  world.ants.lifeLeft[resting[0]] = 0.0001; // a hungry resting ant would just eat
  const before = colony.resting;
  stepWorld(world);
  assert.equal(colony.resting, before - 1);
});

test("resting: off, tired ants go straight back out", () => {
  const world = restWorld();
  world.params.restAtHome = false;
  const ant = addAnt(world, { x: 200, y: 200 }, AntState.ReturningExhausted);
  stepWorld(world);
  assert.equal(world.ants.state[ant], AntState.Foraging);
  assert.equal(world.colonies[0].resting, 0);
});

test("resting: crumbs from a nearly bare pile call nobody out", () => {
  const world = restWorld();
  const colony = world.colonies[0];
  startResting(world, colony, addAnt(world, { x: 200, y: 200 }));
  // A forager takes from a pile with 20 left: below recruitMinPile.
  world.food.items.push({ uid: 1, pos: { x: 300, y: 300 }, amount: 21, capacity: 600, infinite: false, kind: 0 });
  const forager = addAnt(world, { x: 300, y: 300 });
  stepWorld(world);
  assert.equal(world.ants.state[forager], AntState.ReturningFood);
  assert.equal(world.ants.richFind[forager], 0);
  world.ants.posX[forager] = 200;
  world.ants.posY[forager] = 200;
  stepWorld(world);
  assert.equal(colony.deliveredTotal, 1);
  assert.equal(colony.resting, 1, "nobody was called out");
});

test("resting: a forager that reaches a bare pile goes home and rests", () => {
  const world = restWorld();
  const colony = world.colonies[0];
  world.food.items.push({ uid: 1, pos: { x: 300, y: 200 }, amount: 0.5, capacity: 600, infinite: false, kind: 0 });
  const ant = addAnt(world, { x: 300, y: 200 });
  stepWorld(world);
  assert.equal(world.ants.state[ant], AntState.ReturningExhausted, "nothing here: it turns for home");
  world.ants.posX[ant] = 200;
  world.ants.posY[ant] = 200;
  stepWorld(world);
  assert.equal(world.ants.state[ant], AntState.Resting);
  assert.equal(colony.resting, 1);
});

test("resting: a strong food smell keeps a tired forager out only until half its energy is gone", () => {
  const world = restWorld();
  const grid = world.markers;
  // Strong food scent all around the ant.
  for (let i = 0; i < grid.toFood.length; i++) grid.toFood[i] = 1;
  const ant = addAnt(world, { x: 300, y: 300 });
  world.ants.energy[ant] = world.params.exhaustedAt - 1;
  stepWorld(world);
  assert.equal(world.ants.state[ant], AntState.Foraging, "a strong smell keeps it going");
  world.ants.energy[ant] = 0.5 * world.params.exhaustedAt - 1;
  stepWorld(world);
  assert.equal(world.ants.state[ant], AntState.ReturningExhausted, "below half, it goes home whatever it smells");
});
