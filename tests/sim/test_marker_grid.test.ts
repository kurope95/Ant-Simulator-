import test from "node:test";
import assert from "node:assert/strict";

import { kNoOwner } from "../../src/sim/types.js";
import {
  MarkerChannel,
  decayMarkers,
  degrade,
  deposit,
  emissionStrength,
  foodAt,
  homeAt,
  makeMarkerGrid,
} from "../../src/sim/marker_grid.js";
import { defaultParams, markerDecayFactor, type SimParams } from "../../src/sim/params.js";

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);
}

// These tests pin the "highest wins" deposit rule; the adding-up rule has its own tests below.
function oldRule(): SimParams {
  const params = defaultParams();
  params.trailRefresh = 1;
  return params;
}

test("markers: cellIndex maps positions and rejects outside", () => {
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8);
  assert.equal(grid.width, 8);
  assert.equal(grid.height, 4);
  assert.equal(grid.cellIndex({ x: 0, y: 0 }), 0);
  assert.equal(grid.cellIndex({ x: 7.9, y: 7.9 }), 0);
  assert.equal(grid.cellIndex({ x: 8, y: 0 }), 1);
  assert.equal(grid.cellIndex({ x: 63.9, y: 31.9 }), 31);
  assert.equal(grid.cellIndex({ x: 64, y: 0 }), -1);
  assert.equal(grid.cellIndex({ x: -0.1, y: 0 }), -1);
  assert.equal(grid.cellIndex({ x: 0, y: 32 }), -1);
  assert.equal(grid.owner[0], kNoOwner);
});

test("markers: deposit claims free cells and keeps the strongest value", () => {
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8);
  const params = oldRule();
  deposit(grid, 5, 0, MarkerChannel.ToHome, 0.4, params);
  // `owner` is derived by decayMarkers, not by deposit (see the owner test below).
  near(grid.toHome[5], 0.4);
  deposit(grid, 5, 0, MarkerChannel.ToHome, 0.2, params);
  near(grid.toHome[5], 0.4);
  deposit(grid, 5, 0, MarkerChannel.ToHome, 0.9, params);
  near(grid.toHome[5], 0.9);
  assert.equal(grid.toFood[5], 0);
});

test("markers: two colonies share a cell", () => {
  const params = oldRule();
  params.territoryRule = false;
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8, 2);
  deposit(grid, 5, 0, MarkerChannel.ToHome, 0.8, params);
  deposit(grid, 5, 1, MarkerChannel.ToFood, 0.6, params);
  near(homeAt(grid, 0, 5), 0.8);
  near(foodAt(grid, 1, 5), 0.6);
  near(foodAt(grid, 0, 5), 0);
  near(homeAt(grid, 1, 5), 0);
});

test("markers: degrade halves only the depositor's own layer", () => {
  const params = oldRule();
  params.territoryRule = false;
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8, 2);
  deposit(grid, 3, 0, MarkerChannel.ToHome, 0.8, params);
  deposit(grid, 3, 0, MarkerChannel.ToFood, 0.8, params);
  deposit(grid, 3, 1, MarkerChannel.ToHome, 0.6, params);
  degrade(grid, 3, 0, MarkerChannel.ToFood, 0.5);
  near(foodAt(grid, 0, 3), 0.4);
  near(homeAt(grid, 0, 3), 0.8);
  degrade(grid, 3, 1, MarkerChannel.ToHome, 0.5);
  near(homeAt(grid, 1, 3), 0.3);
  near(homeAt(grid, 0, 3), 0.8);
});

test("markers: decay scales both channels and resets empty owners", () => {
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8);
  const params = oldRule();
  deposit(grid, 0, 0, MarkerChannel.ToHome, 0.5, params);
  deposit(grid, 0, 0, MarkerChannel.ToFood, 0.25, params);
  deposit(grid, 1, 2, MarkerChannel.ToFood, 1e-5, params);
  decayMarkers(grid, 0.5, 1e-4, 1.25);
  assert.ok(Math.abs(grid.toHome[0] - 0.25) < 1e-6);
  assert.ok(Math.abs(grid.toFood[0] - 0.125) < 1e-6);
  assert.equal(grid.owner[0], 0);
  assert.equal(grid.toFood[1], 0);
  assert.equal(grid.owner[1], kNoOwner);
});

test("markers: owner is the stronger colony after decay", () => {
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8, 2);
  const cells = grid.width * grid.height;
  grid.toHome[0] = 0.4;
  grid.toFood[cells] = 0.9;
  grid.toFood[1] = 0.7;
  decayMarkers(grid, 0.5, 1e-4, 1.25);
  assert.equal(grid.owner[0], 1);
  assert.equal(grid.owner[1], 0);
  near(grid.toHome[0], 0.2);
  near(grid.toFood[cells], 0.45);
});

test("territory: a foreign deposit wears rival layers but never blocks the depositor", () => {
  const params = oldRule();
  params.territoryRule = true;
  params.foreignErasureFactor = 0.5;
  const grid = makeMarkerGrid({ x: 48, y: 48 }, 8, 2);
  const cell = grid.cellIndex({ x: 4, y: 4 });
  deposit(grid, cell, 0, MarkerChannel.ToHome, 0.8, params);
  deposit(grid, cell, 0, MarkerChannel.ToFood, 0.8, params);
  deposit(grid, cell, 1, MarkerChannel.ToFood, 0.6, params);
  // 0.6 strength wears colony 0's layers by 1 - 0.5 * 0.6 = 0.7.
  near(homeAt(grid, 0, cell), 0.56);
  near(foodAt(grid, 0, cell), 0.56);
  near(foodAt(grid, 1, cell), 0.6);
});

test("territory: with the rule off a foreign deposit changes nothing", () => {
  const params = oldRule();
  params.territoryRule = false;
  const grid = makeMarkerGrid({ x: 48, y: 48 }, 8, 2);
  const cell = grid.cellIndex({ x: 4, y: 4 });
  deposit(grid, cell, 0, MarkerChannel.ToHome, 0.4, params);
  deposit(grid, cell, 1, MarkerChannel.ToHome, 0.8, params);
  near(homeAt(grid, 0, cell), 0.4);
  near(homeAt(grid, 1, cell), 0.8);
});

test("markers: the decay factor halves per half-life and is frame-rate independent", () => {
  const params = oldRule();
  const f60 = markerDecayFactor(params, 1 / 60);
  assert.ok(Math.abs(f60 - Math.pow(2, -1 / 60 / params.markerHalfLife)) < 1e-12, `factor ${f60}`);
  // The M1 default of a 7.7 s half-life was the original 0.9985 per tick.
  const legacy = { ...params, markerHalfLife: 7.7 };
  assert.ok(Math.abs(markerDecayFactor(legacy, 1 / 60) - 0.9985) <= 2e-5);
  const f120 = markerDecayFactor(params, 1 / 120);
  assert.ok(Math.abs(f120 * f120 - f60) < 1e-12);
});

test("trails: an exhausted food's trail fades below markerDetectMin within 150 s", () => {
  // A full-strength deposit is what an ant lays at the instant it picks up, so
  // the cell at a food source holds one; once the source is empty nothing
  // refreshes it and only decay is left (spec §4.2, §5.4).
  const params = oldRule();
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8);
  const cell = grid.cellIndex({ x: 4, y: 4 });
  deposit(grid, cell, 0, MarkerChannel.ToFood, 1, params);
  const factor = markerDecayFactor(params, 1 / params.simHz);
  for (let tick = 0; tick < 150 * params.simHz; tick++) {
    decayMarkers(grid, factor, params.markerDetectMin, params.flipMargin);
  }
  const left = foodAt(grid, 0, cell);
  assert.ok(left < params.markerDetectMin, `trail still ${left} after 150 s`);
});

test("owner: a rival's traffic flips a cell once it is clearly stronger", () => {
  const params = oldRule();
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8, 2);
  deposit(grid, 0, 0, MarkerChannel.ToFood, 1, params);
  decayMarkers(grid, 1, 1e-4, params.flipMargin);
  assert.equal(grid.owner[0], 0);
  // Each 0.8 deposit wears colony 0's food to 60% of what it was: 1 → 0.6 → 0.36 → 0.216.
  for (let i = 0; i < 3; i++) deposit(grid, 0, 1, MarkerChannel.ToFood, 0.8, params);
  near(foodAt(grid, 0, 0), 0.216);
  near(foodAt(grid, 1, 0), 0.8);
  decayMarkers(grid, 1, 1e-4, params.flipMargin);
  assert.equal(grid.owner[0], 1);
});

test("owner: hysteresis keeps the owner until a rival is 25% stronger", () => {
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8, 2);
  const cells = grid.width * grid.height;
  grid.owner[0] = 0;
  grid.toFood[0] = 0.6;
  grid.toFood[cells] = 0.7;
  decayMarkers(grid, 1, 1e-4, 1.25);
  assert.equal(grid.owner[0], 0);
  grid.toFood[cells] = 0.8;
  decayMarkers(grid, 1, 1e-4, 1.25);
  assert.equal(grid.owner[0], 1);
});

test("markers: emission strength falls off with time since the anchor", () => {
  const params = oldRule();
  assert.equal(emissionStrength(0, params), 1);
  assert.ok(Math.abs(emissionStrength(20, params) - Math.exp(-20 * params.emissionDecay)) < 1e-9);
  assert.ok(emissionStrength(200, params) < params.markerEps);
});

test("markers: one ant closes only its share of the gap; a busy trail nears full", () => {
  const params = defaultParams();
  params.trailRefresh = 0.3;
  const grid = makeMarkerGrid({ x: 100, y: 100 }, params.markerCell, 1);
  const cell = grid.cellIndex({ x: 50, y: 50 });
  deposit(grid, cell, 0, MarkerChannel.ToFood, 1, params);
  assert.ok(Math.abs(foodAt(grid, 0, cell) - 0.3) < 1e-6, "one ant leaves a faint trail");
  for (let i = 0; i < 9; i++) deposit(grid, cell, 0, MarkerChannel.ToFood, 1, params);
  assert.ok(foodAt(grid, 0, cell) > 0.95 && foodAt(grid, 0, cell) < 1, "ten ants nearly fill it");
  deposit(grid, cell, 0, MarkerChannel.ToFood, 0.2, params);
  assert.ok(foodAt(grid, 0, cell) > 0.95, "a weaker ant never lowers it");
});

test("markers: a trail nobody of its colony walks for trailUnusedLife is gone, a walked one stays", () => {
  const params = defaultParams();
  const grid = makeMarkerGrid({ x: 100, y: 100 }, params.markerCell, 1);
  const walked = grid.cellIndex({ x: 20, y: 20 });
  const left = grid.cellIndex({ x: 80, y: 80 });
  const maxAge = 100;
  for (let tick = 1; tick <= 250; tick++) {
    grid.now = tick;
    if (tick === 1) deposit(grid, left, 0, MarkerChannel.ToFood, 1, params);
    if (tick % 10 === 0) deposit(grid, walked, 0, MarkerChannel.ToFood, 1, params);
    decayMarkers(grid, 0.9999, params.markerEps, params.flipMargin, maxAge);
    if (tick === 100) assert.ok(foodAt(grid, 0, left) > 0.9, "still there before its time");
  }
  assert.equal(foodAt(grid, 0, left), 0, "gone after maxAge ticks unwalked");
  assert.ok(foodAt(grid, 0, walked) > 0.9, "a walked trail stays");
});
