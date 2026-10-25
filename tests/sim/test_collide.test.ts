import test from "node:test";
import assert from "node:assert/strict";

import {
  isSolidAt,
  makeObstacleGrid,
  rebuildBorder,
} from "../../src/sim/obstacles.js";
import { defaultParams, type SimParams } from "../../src/sim/params.js";
import { addColony, FoodKind, addFood, makeSetup, ObstacleKind, paintCells } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { stepWorld, type World } from "../../src/sim/world.js";

function wallWorld(edit?: (setup: ReturnType<typeof makeSetup>) => void): {
  world: World;
  params: SimParams;
} {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  const setup = makeSetup({ x: 400, y: 300 }, 3, "test");
  addColony(setup, { x: 20, y: 20 }, 0, 0);
  addFood(setup, { x: 360, y: 260 }, 500, FoodKind.Seeds);
  edit?.(setup);
  return { world: worldFromSetup(setup, params), params };
}

function spawn(world: World, x: number, y: number): number {
  return world.ants.spawn(
    { pos: { x, y }, heading: 0 },
    world.nextUid++,
    world.params.antSpeed,
    world.params,
  );
}

test("collide: an ant hitting a wall head-on slides along it", () => {
  const { world } = wallWorld((setup) => paintCells(setup, ObstacleKind.Rock, { x: 140, y: 100 }, 40));
  const index = spawn(world, 96.5, 100);
  let inside = false;
  for (let tick = 0; tick < 60; tick++) {
    stepWorld(world);
    if (isSolidAt(world.obstacles, { x: world.ants.posX[index], y: world.ants.posY[index] })) {
      inside = true;
    }
  }
  assert.equal(inside, false, "ant ended inside a solid cell");
  assert.ok(
    Math.abs(world.ants.posY[index] - 100) > 20,
    `ant slid to y=${world.ants.posY[index]}`,
  );
});

test("collide: ants slide along map edges", () => {
  const { world, params } = wallWorld();
  const index = spawn(world, 400 - params.antRadius, 150);
  let pathLength = 0;
  for (let tick = 0; tick < 60; tick++) {
    const beforeX = world.ants.posX[index];
    const beforeY = world.ants.posY[index];
    stepWorld(world);
    pathLength += Math.hypot(
      world.ants.posX[index] - beforeX,
      world.ants.posY[index] - beforeY,
    );
  }
  assert.ok(
    Math.abs(world.ants.posY[index] - 150) > 20,
    `ant slid to y=${world.ants.posY[index]}`,
  );
  assert.ok(pathLength / 60 > 0.5, `ant moved ${pathLength / 60} u/tick on average`);
});

test("collide: nearSolid flags match a brute-force check", () => {
  const grid = makeObstacleGrid({ x: 40, y: 40 }, 4);
  let seed = 12345;
  for (let cell = 0; cell < grid.kind.length; cell++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    if (seed % 5 === 0) grid.kind[cell] = ObstacleKind.Rock;
    else if (seed % 7 === 0) grid.kind[cell] = ObstacleKind.Water;
  }
  rebuildBorder(grid);

  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      let expected = 0;
      for (let r = Math.max(0, row - 1); r <= Math.min(grid.height - 1, row + 1); r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(grid.width - 1, col + 1); c++) {
          const kind = grid.kind[r * grid.width + c];
          if (kind === ObstacleKind.Rock || kind === ObstacleKind.Water) expected = 1;
        }
      }
      assert.equal(
        grid.nearSolid[row * grid.width + col],
        expected,
        `nearSolid at col ${col}, row ${row}`,
      );
    }
  }
});
