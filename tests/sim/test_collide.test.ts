import test from "node:test";
import assert from "node:assert/strict";

import {
  isSolidAt,
  makeObstacleGrid,
  rebuildBorder,
} from "../../src/sim/obstacles.js";
import { defaultParams, type SimParams } from "../../src/sim/params.js";
import { loadPreset } from "../../src/sim/presets.js";
import { addColony, FoodKind, addFood, makeSetup, ObstacleKind, paintCells } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { spawnAtNest } from "../../src/sim/tick.js";
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

test("spawn: never inside rock", () => {
  // Nest at the map centre; a rock disc centred 30 u to its right overlaps the
  // spawn ring at some radii, so a naive single-angle spawn lands inside it.
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  const setup = makeSetup({ x: 400, y: 300 }, 3, "test");
  addColony(setup, { x: 200, y: 150 }, 0, 0);
  paintCells(setup, ObstacleKind.Rock, { x: 230, y: 150 }, 12);
  const world = worldFromSetup(setup, params);
  const colony = world.colonies[0];
  assert.ok(colony !== undefined);
  for (let k = 0; k < 300; k++) {
    const index = spawnAtNest(world, colony);
    const x = world.ants.posX[index];
    const y = world.ants.posY[index];
    assert.equal(isSolidAt(world.obstacles, { x, y }), false, `spawn ${k} at ${x},${y}`);
  }
});

test("collide: an ant inside a rock is moved out", () => {
  // A solid rectangle whose interior cells have no border side. An ant in one
  // of those cells is invisible to the border-only push, so it has to be
  // teleported to the nearest open cell.
  const { world } = wallWorld((setup) => {
    for (let row = 10; row <= 19; row++) {
      for (let col = 20; col <= 27; col++) {
        setup.obstacles.kind[row * setup.obstacles.width + col] = ObstacleKind.Rock;
      }
    }
  });
  const cell = world.obstacles.cell;
  const col = 26;
  const row = 12;
  const index = spawn(world, (col + 0.5) * cell, (row + 0.5) * cell);
  const uid = world.ants.uid[index];
  assert.equal(isSolidAt(world.obstacles, { x: world.ants.posX[index], y: world.ants.posY[index] }), true);
  stepWorld(world);
  const moved = world.ants.indexOf(uid);
  assert.notEqual(moved, null, "ant was removed instead of moved");
  assert.equal(
    isSolidAt(world.obstacles, { x: world.ants.posX[moved!], y: world.ants.posY[moved!] }),
    false,
    `ant still inside a solid cell at ${world.ants.posX[moved!]},${world.ants.posY[moved!]}`,
  );
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

test("steer: an ant heading at a rock goes around it", () => {
  const { world } = wallWorld((setup) => paintCells(setup, ObstacleKind.Rock, { x: 140, y: 100 }, 15));
  const index = spawn(world, 100, 100);
  const xs: number[] = [];
  const ys: number[] = [];
  let farthest = 0;
  for (let tick = 0; tick < 300; tick++) {
    stepWorld(world);
    xs.push(world.ants.posX[index]);
    ys.push(world.ants.posY[index]);
    farthest = Math.max(
      farthest,
      Math.hypot(world.ants.posX[index] - 100, world.ants.posY[index] - 100),
    );
  }
  for (let start = 0; start + 60 < xs.length; start++) {
    const moved = Math.hypot(xs[start + 60] - xs[start], ys[start + 60] - ys[start]);
    assert.ok(moved >= 3, `ant moved only ${moved.toFixed(2)} u in 60 ticks from tick ${start}`);
  }
  assert.ok(farthest > 150, `farthest ${farthest.toFixed(1)} u`);
});

test("steer: ants pass a 12 u gap", () => {
  const { world } = wallWorld((setup) => {
    const grid = setup.obstacles;
    const paint = (col0: number, col1: number, row0: number, row1: number): void => {
      for (let row = row0; row <= row1; row++) {
        for (let col = col0; col <= col1; col++) grid.kind[row * grid.width + col] = ObstacleKind.Rock;
      }
    };
    paint(35, 39, 15, 23);
    paint(35, 39, 27, 40);
  });
  const index = spawn(world, 100, 100);
  let passed = false;
  for (let tick = 0; tick < 200; tick++) {
    stepWorld(world);
    if (world.ants.posX[index] > 170) {
      passed = true;
      break;
    }
  }
  assert.equal(passed, true, `ant stuck at x=${world.ants.posX[index]}`);
});

function fractionTouchingSolid(world: World): number {
  const grid = world.obstacles;
  const ants = world.ants;
  const reach = world.params.antRadius + 1;
  let touching = 0;
  for (let index = 0; index < ants.size(); index++) {
    const col0 = Math.floor(ants.posX[index] / grid.cell);
    const row0 = Math.floor(ants.posY[index] / grid.cell);
    let hit = false;
    for (let row = row0 - 1; row <= row0 + 1 && !hit; row++) {
      for (let col = col0 - 1; col <= col0 + 1 && !hit; col++) {
        if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) continue;
        const kind = grid.kind[row * grid.width + col];
        if (kind !== ObstacleKind.Rock && kind !== ObstacleKind.Water) continue;
        const nearestX = Math.max(col * grid.cell, Math.min(ants.posX[index], (col + 1) * grid.cell));
        const nearestY = Math.max(row * grid.cell, Math.min(ants.posY[index], (row + 1) * grid.cell));
        const dx = ants.posX[index] - nearestX;
        const dy = ants.posY[index] - nearestY;
        if (dx * dx + dy * dy <= reach * reach) hit = true;
      }
    }
    if (hit) touching += 1;
  }
  return ants.size() === 0 ? 0 : touching / ants.size();
}

test("steer: few ants touch solid ground on the boulder preset", { timeout: 120_000 }, () => {
  const setup = loadPreset("boulder", 1);
  assert.notEqual(setup, null);
  const world = worldFromSetup(setup!, defaultParams());
  let sum = 0;
  let samples = 0;
  for (let tick = 1; tick <= 7200; tick++) {
    stepWorld(world);
    if (tick % 600 === 0) {
      sum += fractionTouchingSolid(world);
      samples += 1;
    }
  }
  const average = sum / samples;
  assert.ok(average < 0.05, `fractionTouchingSolid averaged ${average.toFixed(4)}`);
});
