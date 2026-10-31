import test from "node:test";
import assert from "node:assert/strict";

import { angleDiff } from "../../src/core/math.js";
import { makeColony } from "../../src/sim/colony.js";
import {
  chooseFallback,
  directSightHeading,
  explorerPattern,
  fallbackHeading,
  followerPattern,
  senseMarkers,
} from "../../src/sim/sensing.js";
import { MarkerChannel } from "../../src/sim/marker_grid.js";
import { freeDistance } from "../../src/sim/obstacles.js";
import { defaultParams } from "../../src/sim/params.js";
import { FoodKind, ObstacleKind } from "../../src/sim/setup.js";
import { AntState } from "../../src/sim/types.js";
import { makeWorld, type World } from "../../src/sim/world.js";

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);
}

function makeSenseWorld(): { world: World; index: number } {
  const params = defaultParams();
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 0, y: 0 }));
  const index = world.ants.spawn({ pos: { x: 100, y: 100 }, heading: 0 }, 7, params.antSpeed, params);
  return { world, index };
}

test("sensing: a rival's scent on a cell repels, so an ant keeps to its own road", () => {
  const params = defaultParams();
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 0, y: 0 }), makeColony(1, { x: 0, y: 0 }));
  world.markers.resize(world.size, world.markers.cell, 2);
  const index = world.ants.spawn({ pos: { x: 100, y: 100 }, heading: 0, colony: 1 }, 7, params.antSpeed, params);
  const cells = world.markers.width * world.markers.height;
  const ahead = world.markers.cellIndex({ x: 110, y: 100 });
  const left = world.markers.cellIndex({ x: 100 + 10 * Math.cos(0.5), y: 100 + 10 * Math.sin(0.5) });
  world.markers.toFood[cells + ahead] = 0.3; // the ant's own scent straight ahead
  world.markers.toFood[ahead] = 0.8; // colony 0's scent on the same cell
  world.markers.toFood[cells + left] = 0.2; // the ant's own scent to the left, with no rival
  const pattern = [
    { angleOffset: 0, distance: 10, slot: 0 },
    { angleOffset: 0.5, distance: 10, slot: 1 },
  ];
  // Ahead scores 0.3 - 0.35 * 0.8 = 0.02, so the 0.2 to the left wins.
  near(senseMarkers(world, index, MarkerChannel.ToFood, pattern).targetHeading, 0.5);
  world.params.foreignAversion = 0;
  near(senseMarkers(world, index, MarkerChannel.ToFood, pattern).targetHeading, 0);
});

test("sensing: direct sight of the nest ignores rival scent", () => {
  const params = defaultParams();
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 120, y: 100 }), makeColony(1, { x: 0, y: 0 }));
  world.markers.resize(world.size, world.markers.cell, 2);
  world.params.foreignAversion = 1;
  const index = world.ants.spawn(
    { pos: { x: 100, y: 100 }, heading: 0, colony: 0, state: AntState.ReturningFood },
    7,
    params.antSpeed,
    params,
  );
  const cell = world.markers.cellIndex({ x: 100, y: 100 });
  world.markers.toHome[world.markers.width * world.markers.height + cell] = 1;
  const sight = directSightHeading(world, index);
  assert.ok(sight !== null);
  near(sight, 0);
});

test("sensing: follower and explorer patterns have pinned shapes at default params", () => {
  const follower = followerPattern(defaultParams());
  assert.equal(follower.length, 25);
  assert.deepEqual(follower[0], { angleOffset: -Math.PI / 3, distance: 6.4, slot: 0 });
  assert.deepEqual(follower[24], { angleOffset: Math.PI / 3, distance: 32, slot: 4 });
  const explorer = explorerPattern(defaultParams());
  assert.equal(explorer.length, 6);
  assert.deepEqual(explorer[0], { angleOffset: -Math.PI / 3, distance: 16, slot: 0 });
  assert.deepEqual(explorer[1], { angleOffset: 0, distance: 16, slot: 1 });
  assert.deepEqual(explorer[5], { angleOffset: Math.PI / 3, distance: 32, slot: 2 });
});

test("sensing: the patterns follow the sensor params", () => {
  const params = defaultParams();
  params.sensorRadius = 10;
  params.sensorHalfFovDeg = 20;
  const follower = followerPattern(params);
  assert.equal(follower.length, 25);
  const halfFov = (20 * Math.PI) / 180;
  for (const sample of follower) {
    assert.ok(sample.distance <= 10 + 1e-9, `distance ${sample.distance}`);
    assert.ok(Math.abs(sample.angleOffset) <= halfFov + 1e-9, `angle ${sample.angleOffset}`);
  }
  assert.ok(Math.abs(follower[24].distance - 10) < 1e-9);
  const explorer = explorerPattern(params);
  assert.equal(explorer.length, 6);
  assert.ok(Math.abs(explorer[5].distance - 10) < 1e-9);
});

test("sensing: a narrowed cone stops sensing a far marker", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.toFood[cell] = 0.8;
  world.params.sensorRadius = 10;
  world.params.sensorHalfFovDeg = 20;
  const narrowed = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern(world.params));
  assert.equal(narrowed.found, false);
  world.params.sensorRadius = 32;
  world.params.sensorHalfFovDeg = 60;
  const restored = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern(world.params));
  assert.equal(restored.found, true);
});

test("sensing: an own-colony cell ahead is found", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.toFood[cell] = 0.8;
  const result = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern(world.params));
  assert.equal(result.found, true);
  near(result.bestSignal, 0.8);
  near(result.bestFoodSignal, 0.8);
  assert.ok(Math.abs(result.targetHeading) < 1e-9);
});

test("sensing: a solid halfway point blocks the sample", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 132, y: 100 });
  world.markers.toFood[cell] = 0.8;
  const pattern = [{ angleOffset: 0, distance: 32, slot: 0 }];
  const open = senseMarkers(world, index, MarkerChannel.ToFood, pattern);
  assert.equal(open.found, true);

  const grid = world.obstacles;
  const col = Math.floor(116 / grid.cell);
  const row = Math.floor(100 / grid.cell);
  grid.kind[row * grid.width + col] = ObstacleKind.Rock;
  const blocked = senseMarkers(world, index, MarkerChannel.ToFood, pattern);
  assert.equal(blocked.found, false);
  assert.equal(blocked.bestSignal, 0);
  assert.equal(blocked.bestFoodSignal, 0);
});

test("sensing: a saturated field keeps the ant heading straight", () => {
  const { world, index } = makeSenseWorld();
  for (let y = 64; y <= 168; y += 8) {
    for (let x = 64; x <= 168; x += 8) {
      const cell = world.markers.cellIndex({ x, y });
      if (cell < 0) continue;
      world.markers.toFood[cell] = 0.8;
    }
  }
  const result = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern(world.params));
  assert.equal(result.found, true);
  near(result.bestSignal, 0.8);
  assert.ok(Math.abs(result.targetHeading) < 1e-9, `heading ${result.targetHeading}`);
});

test("sensing: a foreign colony's layer is invisible", () => {
  const { world, index } = makeSenseWorld();
  world.markers.resize(world.size, world.markers.cell, 2);
  const cells = world.markers.width * world.markers.height;
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.toFood[cells + cell] = 0.9;
  const result = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern(world.params));
  assert.equal(result.found, false);
  assert.equal(result.bestSignal, 0);
  assert.equal(result.bestFoodSignal, 0);
});

test("sensing: the food signal is reported even while following home", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.toHome[cell] = 0.2;
  world.markers.toFood[cell] = 0.7;
  const result = senseMarkers(world, index, MarkerChannel.ToHome, followerPattern(world.params));
  assert.equal(result.found, true);
  near(result.bestSignal, 0.2);
  near(result.bestFoodSignal, 0.7);
});

test("sensing: direct sight needs range, facing and the right target", () => {
  const { world, index } = makeSenseWorld();
  world.food.items.push({ uid: 1, pos: { x: 120, y: 110 }, amount: 500, infinite: false, kind: FoodKind.Seeds });
  const heading = directSightHeading(world, index);
  assert.notEqual(heading, null);
  assert.ok(Math.abs(heading! - Math.atan2(10, 20)) < 1e-9);

  world.ants.heading[index] = Math.PI;
  assert.equal(directSightHeading(world, index), null);

  world.ants.state[index] = AntState.ReturningFood;
  world.ants.posX[index] = 20;
  world.ants.posY[index] = 0;
  world.ants.heading[index] = Math.PI;
  const nestHeading = directSightHeading(world, index);
  assert.notEqual(nestHeading, null);
  assert.ok(Math.abs(nestHeading! - Math.PI) < 1e-9);

  const far = makeSenseWorld();
  far.world.food.items.push({ uid: 1, pos: { x: 300, y: 100 }, amount: 500, infinite: false, kind: FoodKind.Seeds });
  assert.equal(directSightHeading(far.world, far.index), null);
});

test("sensing: fallback picks the open gap", () => {
  const { world, index } = makeSenseWorld();
  const grid = world.obstacles;
  for (let row = 25; row <= 39; row++) {
    for (let col = 35; col <= 39; col++) grid.kind[row * grid.width + col] = ObstacleKind.Rock;
  }
  world.ants.wanderHeading[index] = -Math.PI / 6;
  const chosen = fallbackHeading(world, index);
  assert.ok(
    Math.abs(angleDiff(chosen, -Math.PI / 6)) <= (10 * Math.PI) / 180,
    `chosen ${chosen}`,
  );
  assert.equal(
    freeDistance(grid, { x: 100, y: 100 }, chosen, world.params.fallbackRange),
    world.params.fallbackRange,
  );
  assert.ok(freeDistance(grid, { x: 100, y: 100 }, 0, world.params.fallbackRange) < world.params.fallbackRange);
});

test("sensing: fallback's clearAhead matches the chosen heading's look-ahead", () => {
  const { world, index } = makeSenseWorld();
  world.ants.wanderHeading[index] = 0;
  let choice = chooseFallback(world, index);
  assert.equal(
    choice.clearAhead,
    freeDistance(world.obstacles, { x: 100, y: 100 }, choice.heading, world.params.lookAhead) >=
      world.params.lookAhead,
  );

  const grid = world.obstacles;
  for (let row = 22; row <= 28; row++) {
    for (let col = 22; col <= 28; col++) {
      if (row === 22 || row === 28 || col === 22 || col === 28) {
        grid.kind[row * grid.width + col] = ObstacleKind.Rock;
      }
    }
  }
  choice = chooseFallback(world, index);
  assert.equal(choice.clearAhead, false, "boxed in by the rock ring");
});
