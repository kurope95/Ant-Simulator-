import test from "node:test";
import assert from "node:assert/strict";

import { fillHeatmapRgba } from "../../src/render/heatmap.js";
import { meadowTheme } from "../../src/render/theme.js";
import { HeatmapMode } from "../../src/render/view_settings.js";
import { makeMarkerGrid } from "../../src/sim/marker_grid.js";

test("heatmap: trails are teal home, amber food, at 62% alpha", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  grid.toFood[0] = 0;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, meadowTheme(), out);
  assert.deepEqual([...out], [0x4f, 0xc3, 0xb0, 158]);
});

test("heatmap: dual-channel sums both channels and clamps them to 255", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  grid.toFood[0] = 1;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, meadowTheme(), out);
  assert.deepEqual([...out], [255, 255, 255, 158]);
});

test("heatmap: dual-channel sums the same channel over colonies", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8, 2);
  grid.toHome[0] = 0.5;
  grid.toHome[1] = 0.4;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, meadowTheme(), out);
  assert.deepEqual([...out], [71, 176, 158, 142]);
});

test("heatmap: off writes transparent pixels", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  const out = new Uint8Array([9, 9, 9, 9]);
  fillHeatmapRgba(grid, HeatmapMode.Off, meadowTheme(), out);
  assert.deepEqual([...out], [0, 0, 0, 0]);
});

test("heatmap: colonies mode uses the palette colour and the stronger channel", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8, 3);
  grid.owner[0] = 2;
  grid.toFood[2] = 0.5;
  grid.toHome[2] = 0;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.ColonyColor, meadowTheme(), out);
  assert.deepEqual([...out], [0x4c, 0x8d, 0xde, 79]);
});

test("heatmap: unowned cells stay transparent in both coloured modes", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  for (const mode of [HeatmapMode.DualChannel, HeatmapMode.ColonyColor]) {
    const out = new Uint8Array([9, 9, 9, 9]);
    fillHeatmapRgba(grid, mode, meadowTheme(), out);
    assert.deepEqual([...out], [0, 0, 0, 0]);
  }
});
