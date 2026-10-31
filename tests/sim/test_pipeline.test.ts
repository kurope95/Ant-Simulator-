import test from "node:test";
import assert from "node:assert/strict";

import { randRange, randUnit } from "../../src/core/rng.js";
import { fromAngle, type Vec2 } from "../../src/core/vec2.js";
import { makeColony, nestRadius } from "../../src/sim/colony.js";
import { kPhaseCount } from "../../src/sim/phases.js";
import { defaultParams, markerDecayFactor, type SimParams } from "../../src/sim/params.js";
import { FoodKind } from "../../src/sim/setup.js";
import { AntRole, AntState, RandStream } from "../../src/sim/types.js";
import { makeWorld, stepWorld, type World } from "../../src/sim/world.js";

function makePipelineWorld(nest: Vec2 = { x: 10, y: 10 }): { world: World; params: SimParams } {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 400;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  // These tests pin the original rules; test_life_cycle covers meals, age and births.
  params.lifeCycle = false;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, nest));
  return { world, params };
}

function spawnAnt(world: World, pos: Vec2, heading = 0): number {
  const index = world.ants.spawn(
    { pos, heading },
    world.nextUid++,
    world.params.antSpeed,
    world.params,
  );
  world.colonies[0].population += 1;
  return index;
}

test("pipeline: stepWorld on an empty world is safe", () => {
  const world = makeWorld(defaultParams(), 1);
  for (let i = 0; i < 10; i++) stepWorld(world);
  assert.equal(world.tick, 10);
  assert.equal(world.ants.size(), 0);
  assert.equal(world.timings.ms.length, kPhaseCount);
  assert.ok(Number.isFinite(world.timings.totalMs));
  assert.ok(Number.isFinite(world.markers.toHome[0]));
});

test("events: a food pickup flips heading, state and mass", () => {
  const { world, params } = makePipelineWorld();
  const index = spawnAnt(world, { x: 100, y: 100 });
  world.ants.energy[index] = 50;
  world.food.items.push({ uid: 1, pos: { x: 100, y: 100 }, amount: 5, infinite: false, kind: FoodKind.Seeds });
  stepWorld(world);
  assert.equal(world.ants.state[index], AntState.ReturningFood);
  assert.equal(world.ants.mass[index], params.massCarrying);
  assert.equal(world.ants.energy[index], params.energyMax);
  assert.ok(Math.abs(Math.abs(world.ants.heading[index]) - Math.PI) < 1e-5);
  assert.equal(world.ants.timeSinceAnchor[index], 0);
  assert.equal(world.food.items[0].amount, 4);
});

test("events: a carrying ant only refills energy at food", () => {
  const { world } = makePipelineWorld();
  const index = spawnAnt(world, { x: 100, y: 100 });
  world.ants.state[index] = AntState.ReturningFood;
  world.ants.energy[index] = 50;
  world.food.items.push({ uid: 1, pos: { x: 100, y: 100 }, amount: 5, infinite: false, kind: FoodKind.Seeds });
  stepWorld(world);
  assert.equal(world.ants.state[index], AntState.ReturningFood);
  assert.equal(world.ants.energy[index], world.params.energyMax);
  assert.equal(world.food.items[0].amount, 5);
});

test("events: arriving at the nest delivers food and refills energy", () => {
  const { world, params } = makePipelineWorld();
  const index = spawnAnt(world, { x: 10, y: 10 });
  world.ants.state[index] = AntState.ReturningFood;
  world.ants.energy[index] = 40;
  stepWorld(world);
  const colony = world.colonies[0];
  assert.equal(colony.foodPool, 1);
  assert.equal(colony.deliveredTotal, 1);
  assert.equal(colony.deliveredLastSample, 1);
  assert.equal(world.ants.state[index], AntState.Foraging);
  assert.equal(world.ants.mass[index], params.mass);
  assert.equal(world.ants.energy[index], params.energyMax);
  assert.equal(world.ants.timeSinceAnchor[index], 0);
});

test("events: an exhausted ant that reaches the nest forages again", () => {
  const { world } = makePipelineWorld();
  const index = spawnAnt(world, { x: 10, y: 10 });
  world.ants.state[index] = AntState.ReturningExhausted;
  world.ants.energy[index] = 10;
  stepWorld(world);
  assert.equal(world.ants.state[index], AntState.Foraging);
  assert.equal(world.ants.energy[index], world.params.energyMax);
  assert.equal(world.ants.timeSinceAnchor[index], 0);
});

test("events: a forager touching its own nest refills energy", () => {
  const { world } = makePipelineWorld();
  const index = spawnAnt(world, { x: 10, y: 10 });
  world.ants.energy[index] = 50;
  stepWorld(world);
  assert.equal(world.ants.state[index], AntState.Foraging);
  assert.equal(world.ants.energy[index], world.params.energyMax);
  assert.equal(world.ants.timeSinceAnchor[index], 0);
});

test("events: spawning spends the food pool and appends an ant at the nest edge", () => {
  const { world, params } = makePipelineWorld();
  spawnAnt(world, { x: 300, y: 300 });
  const colony = world.colonies[0];
  colony.foodPool = params.spawnCost;
  const radiusBefore = nestRadius(colony, world.params);
  const uid = world.nextUid;
  stepWorld(world);
  assert.equal(world.ants.size(), 2);
  assert.equal(colony.foodPool, 0);
  assert.equal(colony.population, 2);
  const index = world.ants.indexOf(uid);
  assert.notEqual(index, null);
  const angle = randRange(world.seed, uid, 1, RandStream.SpawnHeading, -Math.PI, Math.PI);
  const expected = {
    x: colony.nest.x + fromAngle(angle).x * radiusBefore,
    y: colony.nest.y + fromAngle(angle).y * radiusBefore,
  };
  assert.ok(Math.abs(world.ants.posX[index!] - expected.x) < 1e-4);
  assert.ok(Math.abs(world.ants.posY[index!] - expected.y) < 1e-4);
  assert.ok(Math.abs(world.ants.heading[index!] - angle) < 1e-4);
  const role =
    randUnit(world.seed, uid, 1, RandStream.SpawnRole) < params.explorerRatio
      ? AntRole.Explorer
      : AntRole.Follower;
  assert.equal(world.ants.role[index!], role);
});

test("events: the last unit goes to the earlier chunk", () => {
  const { world } = makePipelineWorld();
  world.params.chunkSize = 1;
  const first = spawnAnt(world, { x: 100, y: 100 });
  const second = spawnAnt(world, { x: 101, y: 100 });
  world.food.items.push({ uid: 1, pos: { x: 100, y: 100 }, amount: 1, infinite: false, kind: FoodKind.Seeds });
  stepWorld(world);
  assert.equal(world.ants.state[first], AntState.ReturningFood);
  assert.equal(world.ants.state[second], AntState.Foraging);
  assert.equal(world.food.items.length, 0);
});

test("removals: dead ants are removed and populations fall", () => {
  const { world } = makePipelineWorld();
  const alive = spawnAnt(world, { x: 200, y: 200 });
  const dead = spawnAnt(world, { x: 210, y: 200 });
  const alsoDead = spawnAnt(world, { x: 220, y: 200 });
  world.ants.energy[dead] = 0;
  world.ants.energy[alsoDead] = -1;
  const uid = world.ants.uid[alive];
  stepWorld(world);
  assert.equal(world.ants.size(), 1);
  assert.equal(world.ants.uid[0], uid);
  assert.equal(world.colonies[0].population, 1);
});

test("collisions: ants stay inside the world edges", () => {
  const { world } = makePipelineWorld();
  const low = spawnAnt(world, { x: 1, y: 1 }, Math.PI);
  const high = spawnAnt(world, { x: 399, y: 399 });
  stepWorld(world);
  assert.ok(world.ants.posX[low] >= world.params.antRadius);
  assert.ok(world.ants.posY[low] >= world.params.antRadius);
  assert.ok(world.ants.posX[high] <= world.size.x - world.params.antRadius);
  assert.ok(world.ants.posY[high] <= world.size.y - world.params.antRadius);
});

test("decay: stepWorld fades markers by the per-tick factor", () => {
  const world = makeWorld(defaultParams(), 1);
  world.markers.owner[5] = 0;
  world.markers.toHome[5] = 1;
  stepWorld(world);
  assert.ok(
    Math.abs(world.markers.toHome[5] - markerDecayFactor(world.params, 1 / 60)) < 1e-6,
  );
});

test("stats: deliveries are sampled once per simulated second", () => {
  const { world, params } = makePipelineWorld();
  const colony = world.colonies[0];
  colony.deliveredLastSample = 7;
  world.tick = params.simHz - 1;
  stepWorld(world);
  assert.equal(colony.deliveredPerSecond.size(), 1);
  assert.equal(colony.deliveredPerSecond.get(0), 7);
  assert.equal(colony.deliveredLastSample, 0);
  for (let i = 0; i < 30; i++) stepWorld(world);
  assert.equal(colony.deliveredPerSecond.size(), 1);
});
