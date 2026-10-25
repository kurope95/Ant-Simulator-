import test from "node:test";
import assert from "node:assert/strict";

import { obstacleMaskRgba, terrainMask } from "../../src/render/terrain_mask.js";
import { ObstacleKind } from "../../src/sim/setup.js";

test("terrain mask: rock, water, sand and mud each fill their own channel", () => {
  const kinds = Uint8Array.of(
    ObstacleKind.Rock,
    ObstacleKind.Water,
    ObstacleKind.Sand,
    ObstacleKind.Mud,
    ObstacleKind.None,
  );
  assert.deepEqual([...obstacleMaskRgba(kinds)], [
    255, 0, 0, 0,
    0, 255, 0, 0,
    0, 0, 255, 0,
    0, 0, 0, 255,
    0, 0, 0, 0,
  ]);
});

test("terrain mask: a grid within the texture limit is used as it is", () => {
  const grid = { width: 2, height: 2, cell: 4, kind: Uint8Array.of(0, 0, 0, ObstacleKind.Rock) };
  const mask = terrainMask(grid, 2048);
  assert.equal(mask.width, 2);
  assert.equal(mask.height, 2);
  assert.equal(mask.cell, 4);
  assert.deepEqual([...mask.rgba.subarray(12, 16)], [255, 0, 0, 0]);
});

test("terrain mask: a grid over the texture limit is halved, and each texel keeps its strongest cell", () => {
  // 3 x 2 cells: rock top-left, water bottom-right. Halved to 2 x 1, each texel covers a 2 x 2 block.
  const grid = {
    width: 3,
    height: 2,
    cell: 4,
    kind: Uint8Array.of(ObstacleKind.Rock, 0, 0, 0, 0, ObstacleKind.Water),
  };
  const mask = terrainMask(grid, 2);
  assert.equal(mask.width, 2);
  assert.equal(mask.height, 1);
  assert.equal(mask.cell, 8);
  assert.deepEqual([...mask.rgba], [255, 0, 0, 0, 0, 255, 0, 0]);
});

test("terrain mask: reports whether the grid has water, so the shimmer knows to redraw", () => {
  const dry = { width: 1, height: 1, cell: 4, kind: Uint8Array.of(ObstacleKind.Rock) };
  const wet = { width: 1, height: 1, cell: 4, kind: Uint8Array.of(ObstacleKind.Water) };
  assert.equal(terrainMask(dry, 2048).water, false);
  assert.equal(terrainMask(wet, 2048).water, true);
});
