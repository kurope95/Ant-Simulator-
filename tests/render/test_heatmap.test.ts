import test from "node:test";
import assert from "node:assert/strict";

import { fillHeatmapRgba } from "../../src/render/heatmap.js";
import { nightTheme } from "../../src/render/theme.js";
import { HeatmapMode } from "../../src/render/view_settings.js";
import { makeMarkerGrid } from "../../src/sim/marker_grid.js";

test("heatmap: Off writes transparent pixels", () => {
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  const rgbaOut = new Uint8Array(2 * 4);
  fillHeatmapRgba(grid, HeatmapMode.Off, nightTheme(), rgbaOut);
  assert.deepEqual([...rgbaOut], new Array(8).fill(0));
});

test("heatmap: dual-channel adds home blue and food orange by strength", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  grid.toFood[0] = 0.5;
  const rgbaOut = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, nightTheme(), rgbaOut);
  assert.deepEqual([...rgbaOut], [175, 194, 255, 255]);
});

test("heatmap: empty cells stay clear and ColonyColor uses the owner's colour", () => {
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 0.5;
  grid.toFood[0] = 0.25;
  const rgbaOut = new Uint8Array(2 * 4);
  fillHeatmapRgba(grid, HeatmapMode.ColonyColor, nightTheme(), rgbaOut);
  assert.deepEqual([...rgbaOut.subarray(0, 4)], [112, 38, 29, 128]);
  assert.deepEqual([...rgbaOut.subarray(4)], [0, 0, 0, 0]);
});
