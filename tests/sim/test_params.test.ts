import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams, validate } from "../../src/sim/params.js";
import { Phase, kPhaseCount, phaseName } from "../../src/sim/phases.js";

test("params: defaults match spec section 12", () => {
  const p = defaultParams();
  assert.equal(p.simHz, 60);
  assert.equal(p.worldW, 1920);
  assert.equal(p.worldH, 1080);
  assert.equal(p.markerCell, 8);
  assert.equal(p.obstacleCell, 4);
  assert.equal(p.hashCell, 6);
  assert.equal(p.antRadius, 2.5);
  assert.equal(p.antSpeed, 50);
  assert.equal(p.sensorRadius, 32);
  assert.equal(p.followerSamples, 25);
  assert.equal(p.explorerSamples, 4);
  assert.equal(p.explorerRatio, 0.10);
  assert.equal(p.markerHalfLife, 7.7);
  assert.equal(p.emissionDecay, 0.05);
  assert.equal(p.stuckTimeout, 2.5);
  assert.equal(p.crowdLimit, 4);
  assert.equal(p.energyMax, 100);
  assert.equal(p.exhaustedAt, 30);
  assert.equal(p.tHorizon, 1.0);
  assert.equal(p.rAvoidMax, 24);
  assert.equal(p.maxNeighbours, 16);
  assert.equal(p.maxAntsTotal, 50000);
  assert.equal(p.chunkSize, 1024);
  assert.equal(p.legsMinPx, 20);
});

test("params: validate accepts defaults and explains rejections", () => {
  assert.equal(validate(defaultParams()), null);

  const smallHash = defaultParams();
  smallHash.hashCell = 4;
  assert.equal(validate(smallHash), "hash_cell must be at least 2 * ant_radius");

  const noChunks = defaultParams();
  noChunks.chunkSize = 0;
  assert.equal(validate(noChunks), "chunk_size must be at least 1");

  const noHz = defaultParams();
  noHz.simHz = 0;
  assert.equal(validate(noHz), "sim_hz must be positive");
});

test("phases: names are stable", () => {
  assert.equal(kPhaseCount, 7);
  assert.equal(phaseName(Phase.SpatialHash), "spatial_hash");
  assert.equal(phaseName(Phase.Think), "think");
  assert.equal(phaseName(Phase.Events), "events");
  assert.equal(phaseName(Phase.Collisions), "collisions");
  assert.equal(phaseName(Phase.Removals), "removals");
  assert.equal(phaseName(Phase.Decay), "decay");
  assert.equal(phaseName(Phase.Stats), "stats");
});
