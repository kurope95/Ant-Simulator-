import test from "node:test";
import assert from "node:assert/strict";
import {
  freeDistance, freeDistanceDir, isSolidAt, lineOfSight, makeObstacleGrid, rebuildBorder, speedFactorAt,
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

test("obstacles: freeDistance measures open space ahead", () => {
  const grid = makeObstacleGrid({ x: 80, y: 40 }, 4);
  for (let row = 0; row < grid.height; row++) grid.kind[row * grid.width + 10] = ObstacleKind.Rock;
  const ahead = freeDistance(grid, { x: 20, y: 20 }, 0, 48);
  assert.ok(Math.abs(ahead - 20) <= grid.cell, `freeDistance ${ahead}`);
  assert.equal(freeDistance(grid, { x: 20, y: 20 }, Math.PI, 8), 8);
  assert.equal(freeDistance(grid, { x: 42, y: 20 }, 0, 48), 0);
});

test("obstacles: freeDistanceDir matches freeDistance at every angle", () => {
  const grid = gridWithWall();
  const origins = [{ x: 2, y: 2 }, { x: 20, y: 20 }, { x: 30, y: 10 }];
  for (const origin of origins) {
    for (let step = 0; step < 16; step++) {
      const angle = -Math.PI + (step * Math.PI) / 8;
      const byAngle = freeDistance(grid, origin, angle, 40);
      const byDir = freeDistanceDir(grid, origin, Math.cos(angle), Math.sin(angle), 40);
      assert.ok(Math.abs(byAngle - byDir) < 1e-9, `angle ${angle}: ${byAngle} vs ${byDir}`);
    }
  }
});
