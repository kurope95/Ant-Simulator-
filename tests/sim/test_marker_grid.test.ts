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
import { defaultParams, markerDecayFactor } from "../../src/sim/params.js";

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);
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
  const params = defaultParams();
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
  const params = defaultParams();
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
  const params = defaultParams();
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
  const params = defaultParams();
  deposit(grid, 0, 0, MarkerChannel.ToHome, 0.5, params);
  deposit(grid, 0, 0, MarkerChannel.ToFood, 0.25, params);
  deposit(grid, 1, 2, MarkerChannel.ToFood, 1e-5, params);
  decayMarkers(grid, 0.5, 1e-4);
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
  decayMarkers(grid, 0.5, 1e-4);
  assert.equal(grid.owner[0], 1);
  assert.equal(grid.owner[1], 0);
  near(grid.toHome[0], 0.2);
  near(grid.toFood[cells], 0.45);
});

test("territory: a foreign deposit wears rival layers but never blocks the depositor", () => {
  const params = defaultParams();
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
  const params = defaultParams();
  params.territoryRule = false;
  const grid = makeMarkerGrid({ x: 48, y: 48 }, 8, 2);
  const cell = grid.cellIndex({ x: 4, y: 4 });
  deposit(grid, cell, 0, MarkerChannel.ToHome, 0.4, params);
  deposit(grid, cell, 1, MarkerChannel.ToHome, 0.8, params);
  near(homeAt(grid, 0, cell), 0.4);
  near(homeAt(grid, 1, cell), 0.8);
});

test("markers: the decay factor halves per half-life and is frame-rate independent", () => {
  const params = defaultParams();
  const f60 = markerDecayFactor(params, 1 / 60);
  assert.ok(Math.abs(f60 - Math.pow(2, -1 / 60 / params.markerHalfLife)) < 1e-12, `factor ${f60}`);
  // The M1 default of a 7.7 s half-life was the original 0.9985 per tick.
  const legacy = { ...params, markerHalfLife: 7.7 };
  assert.ok(Math.abs(markerDecayFactor(legacy, 1 / 60) - 0.9985) <= 2e-5);
  const f120 = markerDecayFactor(params, 1 / 120);
  assert.ok(Math.abs(f120 * f120 - f60) < 1e-12);
});

test("markers: emission strength falls off with time since the anchor", () => {
  const params = defaultParams();
  assert.equal(emissionStrength(0, params), 1);
  assert.ok(Math.abs(emissionStrength(20, params) - Math.exp(-20 * params.emissionDecay)) < 1e-9);
  assert.ok(emissionStrength(200, params) < params.markerEps);
});
