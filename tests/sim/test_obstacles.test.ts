import test from "node:test";
import assert from "node:assert/strict";
import {
  isSolidAt, lineOfSight, makeObstacleGrid, rebuildBorder, speedFactorAt,
} from "../../src/sim/obstacles.js";
import { ObstacleKind } from "../../src/sim/setup.js";

function gridWithWall() {
  const grid = makeObstacleGrid({ x: 40, y: 40 }, 4); // 10 x 10 cells
  for (let row = 3; row <= 5; row++) {
    for (let col = 3; col <= 5; col++) grid.kind[row * 10 + col] = ObstacleKind.Rock;
  }
  rebuildBorder(grid);
  return grid;
}

test("obstacles: only edge cells of a solid block are borders", () => {
  const grid = gridWithWall();
  assert.equal(grid.width, 10);
  assert.equal(grid.border[3 * 10 + 3], 1);
  assert.equal(grid.border[4 * 10 + 4], 0);
  assert.equal(isSolidAt(grid, { x: 18, y: 18 }), true);
  assert.equal(isSolidAt(grid, { x: 2, y: 18 }), false);
  assert.equal(isSolidAt(grid, { x: -1, y: 5 }), true);
});

test("obstacles: terrain speed factors", () => {
  const grid = gridWithWall();
  assert.equal(speedFactorAt(grid, { x: 26, y: 26 }), 1);
  grid.kind[6 * 10 + 6] = ObstacleKind.Sand;
  assert.equal(speedFactorAt(grid, { x: 26, y: 26 }), 0.6);
  grid.kind[6 * 10 + 6] = ObstacleKind.Mud;
  assert.equal(speedFactorAt(grid, { x: 26, y: 26 }), 0.45);
  assert.equal(speedFactorAt(grid, { x: 18, y: 18 }), 0);
});

test("obstacles: line of sight is blocked by rock and clear across sand", () => {
  const grid = gridWithWall();
  assert.equal(lineOfSight(grid, { x: 2, y: 18 }, { x: 30, y: 18 }), false);
  assert.equal(lineOfSight(grid, { x: 2, y: 6 }, { x: 30, y: 6 }), true);
  grid.kind[6 * 10 + 6] = ObstacleKind.Sand;
  assert.equal(lineOfSight(grid, { x: 2, y: 26 }, { x: 30, y: 26 }), true);
});
