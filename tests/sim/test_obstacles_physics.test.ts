import test from "node:test";
import assert from "node:assert/strict";
import { isSolidAt } from "../../src/sim/obstacles.js";
import { defaultParams, type SimParams } from "../../src/sim/params.js";
import { followerPattern, senseMarkers, directSightHeading } from "../../src/sim/sensing.js";
import { addColony, addFood, FoodKind, makeSetup, ObstacleKind, paintCells } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { MarkerChannel } from "../../src/sim/marker_grid.js";
import { stepWorld, type World } from "../../src/sim/world.js";

function groundWorld(edit?: (setup: ReturnType<typeof makeSetup>) => void): { world: World; params: SimParams } {
  const params = defaultParams();
  params.worldW = 400; params.worldH = 300;
  params.wanderAngleFollower = 0; params.wanderAngleExplorer = 0;
  const setup = makeSetup({ x: 400, y: 300 }, 3, "test");
  addColony(setup, { x: 20, y: 20 }, 0, 0);
  addFood(setup, { x: 360, y: 260 }, 500, FoodKind.Seeds);
  edit?.(setup);
  const world = worldFromSetup(setup, params);
  return { world, params };
}

function spawn(world: World, x: number, y: number): number {
  return world.ants.spawn({ pos: { x, y }, heading: 0 }, world.nextUid++, world.params.antSpeed, world.params);
}

test("terrain: sand moves an ant at 60% speed", () => {
  const { world } = groundWorld((s) => paintCells(s, ObstacleKind.Sand, { x: 120, y: 50 }, 64));
  const index = spawn(world, 100, 50);
  for (let i = 0; i < 60; i++) stepWorld(world);
  assert.ok(Math.abs(world.ants.posX[index] - 130) < 0.6, `x=${world.ants.posX[index]}`);
});

test("terrain: mud moves an ant at 45% speed", () => {
  const { world } = groundWorld((s) => paintCells(s, ObstacleKind.Mud, { x: 120, y: 50 }, 64));
  const index = spawn(world, 100, 50);
  for (let i = 0; i < 60; i++) stepWorld(world);
  assert.ok(Math.abs(world.ants.posX[index] - 122.5) < 0.6, `x=${world.ants.posX[index]}`);
});

test("collision: an ant goes around a rock wall without touching it", () => {
  const { world, params } = groundWorld((s) => paintCells(s, ObstacleKind.Rock, { x: 160, y: 50 }, 16));
  const index = spawn(world, 100, 50);
  const grid = world.obstacles;
  let rockMaxX = -Infinity;
  for (let cell = 0; cell < grid.kind.length; cell++) {
    if (grid.kind[cell] === ObstacleKind.Rock) {
      rockMaxX = Math.max(rockMaxX, ((cell % grid.width) + 1) * grid.cell);
    }
  }
  function clearance(x: number, y: number): number {
    let best = Infinity;
    const col0 = Math.floor(x / grid.cell);
    const row0 = Math.floor(y / grid.cell);
    for (let row = row0 - 2; row <= row0 + 2; row++) {
      for (let col = col0 - 2; col <= col0 + 2; col++) {
        if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) continue;
        if (grid.kind[row * grid.width + col] !== ObstacleKind.Rock) continue;
        const nearestX = Math.max(col * grid.cell, Math.min(x, (col + 1) * grid.cell));
        const nearestY = Math.max(row * grid.cell, Math.min(y, (row + 1) * grid.cell));
        best = Math.min(best, Math.hypot(x - nearestX, y - nearestY));
      }
    }
    return best;
  }
  for (let i = 0; i < 120; i++) {
    stepWorld(world);
    const gap = clearance(world.ants.posX[index], world.ants.posY[index]);
    assert.ok(gap >= params.antRadius - 1e-6, `overlap ${gap} at tick ${i}`);
  }
  assert.ok(
    world.ants.posX[index] > rockMaxX + params.antRadius,
    `ant never got past the rock: x=${world.ants.posX[index]}`,
  );
  assert.equal(isSolidAt(world.obstacles, { x: world.ants.posX[index], y: world.ants.posY[index] }), false);
});

test("sight: rock blocks direct sight, open ground does not", () => {
  function sight(withRock: boolean): number | null {
    const { world } = groundWorld((s) => {
      addFood(s, { x: 160, y: 50 }, 500, FoodKind.Seeds);
      if (withRock) paintCells(s, ObstacleKind.Rock, { x: 120, y: 50 }, 12);
    });
    world.params.sensorRadius = 80;
    const index = spawn(world, 100, 50);
    return directSightHeading(world, index);
  }
  assert.equal(sight(true), null);
  assert.ok(Math.abs(sight(false)!) < 1e-6);
});

test("scent: a marker sample inside rock is ignored", () => {
  function sensed(withRock: boolean): boolean {
    const { world } = groundWorld((s) => {
      if (withRock) paintCells(s, ObstacleKind.Rock, { x: 132, y: 100 }, 6);
    });
    const index = spawn(world, 100, 100);
    const cell = world.markers.cellIndex({ x: 132, y: 100 });
    world.markers.owner[cell] = 0;
    world.markers.toHome[cell] = 1;
    world.markers.toFood[cell] = 1;
    return senseMarkers(world, index, MarkerChannel.ToHome, followerPattern(world.params)).found;
  }
  assert.equal(sensed(true), false);
  assert.equal(sensed(false), true);
});

test("collision: obstacle worlds stay deterministic", () => {
  const a = groundWorld((s) => paintCells(s, ObstacleKind.Rock, { x: 200, y: 150 }, 40)).world;
  const b = groundWorld((s) => paintCells(s, ObstacleKind.Rock, { x: 200, y: 150 }, 40)).world;
  for (let i = 0; i < 600; i++) { stepWorld(a); stepWorld(b); }
  assert.equal(a.ants.size(), b.ants.size());
});
