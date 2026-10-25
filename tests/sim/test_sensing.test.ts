import test from "node:test";
import assert from "node:assert/strict";

import { makeColony } from "../../src/sim/colony.js";
import {
  directSightHeading,
  explorerPattern,
  followerPattern,
  senseMarkers,
} from "../../src/sim/sensing.js";
import { MarkerChannel } from "../../src/sim/marker_grid.js";
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

test("sensing: follower and explorer patterns have pinned shapes at default params", () => {
  const follower = followerPattern(defaultParams());
  assert.equal(follower.length, 25);
  assert.deepEqual(follower[0], { angleOffset: -Math.PI / 3, distance: 6.4 });
  assert.deepEqual(follower[24], { angleOffset: Math.PI / 3, distance: 32 });
  const explorer = explorerPattern(defaultParams());
  assert.equal(explorer.length, 4);
  assert.deepEqual(explorer[0], { angleOffset: -Math.PI / 3, distance: 16 });
  assert.deepEqual(explorer[3], { angleOffset: Math.PI / 3, distance: 32 });
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
  assert.equal(explorer.length, 4);
  assert.ok(Math.abs(explorer[3].distance - 10) < 1e-9);
});

test("sensing: a narrowed cone stops sensing a far marker", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.owner[cell] = 0;
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
  world.markers.owner[cell] = 0;
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
  world.markers.owner[cell] = 0;
  world.markers.toFood[cell] = 0.8;
  const pattern = [{ angleOffset: 0, distance: 32 }];
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
      world.markers.owner[cell] = 0;
      world.markers.toFood[cell] = 0.8;
    }
  }
  const result = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern(world.params));
  assert.equal(result.found, true);
  near(result.bestSignal, 0.8);
  assert.ok(Math.abs(result.targetHeading) < 1e-9, `heading ${result.targetHeading}`);
});

test("sensing: a foreign-owned cell is ignored", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.owner[cell] = 1;
  world.markers.toFood[cell] = 0.9;
  const result = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern(world.params));
  assert.equal(result.found, false);
  assert.equal(result.bestSignal, 0);
  assert.equal(result.bestFoodSignal, 0);
});

test("sensing: the food signal is reported even while following home", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.owner[cell] = 0;
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
