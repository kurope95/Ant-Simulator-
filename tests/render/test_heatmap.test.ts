import test from "node:test";
import assert from "node:assert/strict";

import { fillHeatmapRgba } from "../../src/render/heatmap.js";
import { meadowTheme, trailHex } from "../../src/render/theme.js";
import { HeatmapMode } from "../../src/render/view_settings.js";
import { makeMarkerGrid } from "../../src/sim/marker_grid.js";

function chroma(rgba: Uint8Array): number {
  return Math.max(rgba[0], rgba[1], rgba[2]) - Math.min(rgba[0], rgba[1], rgba[2]);
}

test("heatmap: trails are teal home, amber food, at 62% alpha", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  grid.toFood[0] = 0;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, meadowTheme(), [], out);
  assert.deepEqual([...out], [0x4f, 0xc3, 0xb0, 158]);
});

test("heatmap: a faint trail keeps its hue and gets a visible alpha", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 0.04;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, meadowTheme(), [], out);
  assert.deepEqual([...out], [0x4f, 0xc3, 0xb0, 32]);
});

test("heatmap: dual-channel mixes the pure hues by food share, alpha from the total", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  grid.toFood[0] = 1;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, meadowTheme(), [], out);
  assert.deepEqual([...out], [160, 188, 135, 158]);
});

test("heatmap: dual-channel sums the same channel over colonies", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8, 2);
  grid.toHome[0] = 0.5;
  grid.toHome[1] = 0.4;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, meadowTheme(), [], out);
  assert.deepEqual([...out], [0x4f, 0xc3, 0xb0, 150]);
});

test("heatmap: off writes transparent pixels", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  const out = new Uint8Array([9, 9, 9, 9]);
  fillHeatmapRgba(grid, HeatmapMode.Off, meadowTheme(), [], out);
  assert.deepEqual([...out], [0, 0, 0, 0]);
});

test("heatmap colonies: a food-only trail is the colony's trail colour", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toFood[0] = 1;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.ColonyColor, meadowTheme(), [0], out);
  assert.deepEqual([...out], [0xff, 0x7a, 0x57, 158]);
});

test("heatmap colonies: a home-only trail is 60% of the colour", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.ColonyColor, meadowTheme(), [0], out);
  assert.deepEqual([...out], [153, 73, 52, 158]);
});

test("heatmap colonies: the colour follows the palette index, not the colony id", () => {
  // Colony id 1 picked palette entry 2 (Azure). The old code drew Gold here.
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8, 2);
  grid.owner[0] = 1;
  grid.toFood[1] = 1;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.ColonyColor, meadowTheme(), [0, 2], out);
  assert.deepEqual([...out], [0x6a, 0xa8, 0xff, 158]);
});

test("heatmap colonies: a contested cell loses saturation, and an uncontested one keeps it", () => {
  const contested = makeMarkerGrid({ x: 8, y: 8 }, 8, 2);
  contested.owner[0] = 0;
  contested.toFood[0] = 1;
  contested.toFood[1] = 1;
  const contestedOut = new Uint8Array(4);
  fillHeatmapRgba(contested, HeatmapMode.ColonyColor, meadowTheme(), [0, 2], contestedOut);

  const alone = makeMarkerGrid({ x: 8, y: 8 }, 8, 2);
  alone.owner[0] = 0;
  alone.toFood[0] = 1;
  const aloneOut = new Uint8Array(4);
  fillHeatmapRgba(alone, HeatmapMode.ColonyColor, meadowTheme(), [0, 2], aloneOut);

  assert.ok(chroma(contestedOut) < chroma(aloneOut));
  assert.equal(contestedOut[3], aloneOut[3]);
});

test("heatmap colonies: unowned cells stay transparent in both coloured modes", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  for (const mode of [HeatmapMode.DualChannel, HeatmapMode.ColonyColor]) {
    const out = new Uint8Array([9, 9, 9, 9]);
    fillHeatmapRgba(grid, mode, meadowTheme(), [0], out);
    assert.deepEqual([...out], [0, 0, 0, 0]);
  }
});

test("trail colours: each palette entry has its luminous variant, and the index wraps", () => {
  assert.equal(trailHex(0), 0xff7a57);
  assert.equal(trailHex(2), 0x6aa8ff);
  assert.equal(trailHex(7), 0xf2ead8);
  assert.equal(trailHex(8), trailHex(0));
});
