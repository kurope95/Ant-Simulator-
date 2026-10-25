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

test("collision: an ant stops outside a rock wall and is never left inside it", () => {
  const { world, params } = groundWorld((s) => paintCells(s, ObstacleKind.Rock, { x: 160, y: 50 }, 16));
  const index = spawn(world, 100, 50);
  for (let i = 0; i < 120; i++) stepWorld(world);
  let wallX = Infinity;
  for (let cell = 0; cell < world.obstacles.kind.length; cell++) {
    if (world.obstacles.kind[cell] !== ObstacleKind.Rock) continue;
    const row = Math.floor(cell / world.obstacles.width);
    const col = cell % world.obstacles.width;
    if (50 >= row * 4 && 50 < (row + 1) * 4) wallX = Math.min(wallX, col * 4);
  }
  assert.ok(Number.isFinite(wallX));
  assert.ok(world.ants.posX[index] + params.antRadius <= wallX + 0.01, `x=${world.ants.posX[index]}`);
  assert.equal(isSolidAt(world.obstacles, { x: world.ants.posX[index], y: 50 }), false);
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
