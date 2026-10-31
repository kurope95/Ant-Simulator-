import test from "node:test";
import assert from "node:assert/strict";

import type { Vec2 } from "../../src/core/vec2.js";
import { makeColony } from "../../src/sim/colony.js";
import { ContactKind, makeChunkEvents, type ChunkEvents } from "../../src/sim/events.js";
import { MarkerChannel } from "../../src/sim/marker_grid.js";
import { defaultParams, type SimParams } from "../../src/sim/params.js";
import { FoodKind } from "../../src/sim/setup.js";
import { thinkChunk } from "../../src/sim/tick.js";
import { AntRole, AntState } from "../../src/sim/types.js";
import { makeWorld, type World } from "../../src/sim/world.js";

function makeThinkWorld(pos: Vec2, heading = 0): { world: World; index: number; params: SimParams } {
  const params = defaultParams();
  params.worldW = 200;
  params.worldH = 200;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 10, y: 10 }));
  const index = world.ants.spawn({ pos, heading }, 42, params.antSpeed, params);
  return { world, index, params };
}

function thinkOnce(world: World, out: ChunkEvents = makeChunkEvents()): ChunkEvents {
  thinkChunk(world, 0, world.ants.size(), out);
  return out;
}

test("think: timers advance and energy burns", () => {
  const { world, index, params } = makeThinkWorld({ x: 100, y: 100 });
  world.ants.degradeTimer[index] = 3;
  thinkOnce(world);
  assert.ok(Math.abs(world.ants.energy[index] - (params.energyMax - params.energyBurn / 60)) < 1e-4);
  assert.ok(Math.abs(world.ants.timeSinceAnchor[index] - 1 / 60) < 1e-5);
  assert.ok(Math.abs(world.ants.timeSinceLastMarker[index] - 1 / 60) < 1e-5);
  assert.ok(Math.abs(world.ants.degradeTimer[index] - (3 - 1 / 60)) < 1e-5);
});

test("think: an ant moves along its heading and keeps the previous position", () => {
  const { world, index } = makeThinkWorld({ x: 100, y: 100 });
  for (let t = 0; t < 10; t++) thinkOnce(world);
  assert.ok(Math.abs(world.ants.posX[index] - (100 + (50 * 10) / 60)) < 1e-3);
  assert.ok(Math.abs(world.ants.posY[index] - 100) < 1e-3);
  assert.ok(Math.abs(world.ants.prevX[index] - (100 + (50 * 9) / 60)) < 1e-3);
});

test("think: a visible target turns the ant at most turnRate * dt", () => {
  const { world, index, params } = makeThinkWorld({ x: 100, y: 100 });
  const target = 0.5;
  world.food.items.push({
    uid: 1,
    pos: { x: 100 + Math.cos(target) * 20, y: 100 + Math.sin(target) * 20 },
    amount: 500,
    infinite: false,
    kind: FoodKind.Seeds,
  });
  thinkOnce(world);
  assert.ok(Math.abs(world.ants.heading[index] - params.turnRate / 60) < 1e-5);
});

test("think: a low-energy forager turns back unless food is sensed", () => {
  const hungry = makeThinkWorld({ x: 100, y: 100 });
  hungry.world.ants.energy[hungry.index] = 20;
  thinkOnce(hungry.world);
  assert.equal(hungry.world.ants.state[hungry.index], AntState.ReturningExhausted);

  const fed = makeThinkWorld({ x: 100, y: 100 });
  fed.world.ants.energy[fed.index] = 40; // tired, but above half of exhaustedAt: a strong smell still keeps it out
  const cell = fed.world.markers.cellIndex({ x: 120, y: 100 });
  fed.world.markers.owner[cell] = 0;
  fed.world.markers.toFood[cell] = 0.8;
  thinkOnce(fed.world);
  assert.equal(fed.world.ants.state[fed.index], AntState.Foraging);
});

test("think: a forager deposits a home trail after the drop distance", () => {
  const { world, index, params } = makeThinkWorld({ x: 100, y: 100 });
  const out = makeChunkEvents();
  for (let t = 0; t < 10; t++) thinkChunk(world, 0, 1, out);
  assert.equal(out.deposits.length, 1);
  const event = out.deposits[0];
  assert.equal(event.channel, MarkerChannel.ToHome);
  assert.equal(event.colony, 0);
  assert.equal(
    event.cell,
    world.markers.cellIndex({ x: world.ants.posX[index], y: world.ants.posY[index] }),
  );
  assert.ok(
    Math.abs(event.strength - Math.exp(-world.ants.timeSinceAnchor[index] * params.emissionDecay)) <
      1e-5,
  );
  assert.equal(world.ants.dropX[index], world.ants.posX[index]);
  assert.equal(world.ants.timeSinceLastMarker[index], 0);
});

test("think: exhausted ants move their drop point without depositing", () => {
  // Facing the nest, so the homing ant flies straight for the whole run.
  const { world, index } = makeThinkWorld({ x: 100, y: 100 }, Math.atan2(10 - 100, 10 - 100));
  world.ants.state[index] = AntState.ReturningExhausted;
  const out = makeChunkEvents();
  for (let t = 0; t < 10; t++) thinkChunk(world, 0, 1, out);
  assert.equal(out.deposits.length, 0);
  assert.equal(world.ants.dropX[index], world.ants.posX[index]);
});

test("think: a returning ant deposits food trail", () => {
  const { world, index } = makeThinkWorld({ x: 100, y: 100 });
  world.ants.state[index] = AntState.ReturningFood;
  const out = makeChunkEvents();
  // 12 ticks, not 10: a homing ant curves toward the nest, so its straight-line
  // distance from the drop point lags the 8 u walked until it has turned.
  for (let t = 0; t < 12; t++) thinkChunk(world, 0, 1, out);
  assert.equal(out.deposits.length, 1);
  assert.equal(out.deposits[0].channel, MarkerChannel.ToFood);
});

test("think: a degrading ant erases each new own cell once", () => {
  const { world, index } = makeThinkWorld({ x: 100, y: 100 });
  world.ants.degradeTimer[index] = 3;
  const cell = world.markers.cellIndex({ x: 100, y: 100 });
  world.markers.owner[cell] = 0;
  world.markers.toFood[cell] = 1;
  const out = makeChunkEvents();
  thinkChunk(world, 0, 1, out);
  thinkChunk(world, 0, 1, out);
  assert.equal(out.degrades.length, 1);
  assert.equal(out.degrades[0].cell, cell);
  assert.equal(out.degrades[0].channel, MarkerChannel.ToFood);
});

test("think: contacts fire for food and the ant's own nest only", () => {
  const foodWorld = makeThinkWorld({ x: 100, y: 100 });
  foodWorld.world.food.items.push({ uid: 1, pos: { x: 100, y: 100 }, amount: 500, infinite: false, kind: FoodKind.Seeds });
  const foodOut = thinkOnce(foodWorld.world);
  assert.equal(foodOut.contacts.some((c) => c.kind === ContactKind.Food && c.target === 0), true);

  const nestWorld = makeThinkWorld({ x: 10, y: 10 });
  const nestOut = thinkOnce(nestWorld.world);
  assert.equal(nestOut.contacts.some((c) => c.kind === ContactKind.Nest && c.target === 0), true);

  const foreignWorld = makeThinkWorld({ x: 50, y: 50 });
  foreignWorld.world.colonies.push(makeColony(1, { x: 50, y: 50 }));
  const foreignOut = thinkOnce(foreignWorld.world);
  assert.equal(foreignOut.contacts.length, 0);
});
