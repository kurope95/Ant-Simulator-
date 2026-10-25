import test from "node:test";
import assert from "node:assert/strict";

import { wrapAngle } from "../../src/core/math.js";
import { makeColony } from "../../src/sim/colony.js";
import { ContactKind, makeChunkEvents } from "../../src/sim/events.js";
import { addFoodSource } from "../../src/sim/food.js";
import { defaultParams } from "../../src/sim/params.js";
import { turnToward, updateWander } from "../../src/sim/steering.js";
import { thinkChunk } from "../../src/sim/tick.js";
import { AntRole } from "../../src/sim/types.js";
import { makeWorld } from "../../src/sim/world.js";

test("steering: turnToward turns at most maxTurn and takes the short way", () => {
  assert.equal(turnToward(0, Math.PI / 2, 0.1), 0.1);
  assert.ok(Math.abs(turnToward(0, -Math.PI / 2, 0.1) + 0.1) < 1e-12);
  const acrossPi = turnToward(3, -3, 0.5);
  assert.ok(Math.abs(wrapAngle(acrossPi) - wrapAngle(-3)) < 1e-9);
});

test("steering: wander stays inside each role's angle and resamples on a timer", () => {
  const params = defaultParams();
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 0, y: 0 }));
  const follower = world.ants.spawn({ pos: { x: 10, y: 10 } }, 1, 50, params);
  const explorer = world.ants.spawn(
    { pos: { x: 20, y: 20 }, role: AntRole.Explorer },
    2,
    50,
    params,
  );
  for (let t = 0; t < 200; t++) {
    world.tick = t;
    updateWander(world, follower, 1 / 60);
    updateWander(world, explorer, 1 / 60);
    assert.ok(Math.abs(world.ants.wanderOffset[follower]) <= params.wanderAngleFollower + 1e-6);
    assert.ok(Math.abs(world.ants.wanderOffset[explorer]) <= params.wanderAngleExplorer + 1e-6);
    assert.ok(world.ants.wanderTimer[follower] > 0);
    assert.ok(world.ants.wanderTimer[explorer] > 0);
  }
});

test("wander: explorers turn more than followers", () => {
  const params = defaultParams();
  const world = makeWorld(params, 7, { x: 6000, y: 6000 });
  const centre = { x: 3000, y: 3000 };
  const count = 200;
  const explorers: number[] = [];
  const followers: number[] = [];
  let uid = 1;
  for (let i = 0; i < count; i++) {
    explorers.push(
      world.ants.spawn({ pos: centre, role: AntRole.Explorer }, uid++, params.antSpeed, params),
    );
    followers.push(
      world.ants.spawn({ pos: centre, role: AntRole.Follower }, uid++, params.antSpeed, params),
    );
  }

  const ticks = 300;
  const seconds = ticks / params.simHz;
  const turnedExplorer = new Float64Array(count);
  const turnedFollower = new Float64Array(count);
  const prevExplorer = new Float64Array(count);
  const prevFollower = new Float64Array(count);
  const events = makeChunkEvents();

  for (let t = 0; t < ticks; t++) {
    events.deposits.length = 0;
    events.degrades.length = 0;
    events.contacts.length = 0;
    thinkChunk(world, 0, world.ants.size(), events);
    for (let i = 0; i < count; i++) {
      const e = explorers[i];
      const f = followers[i];
      turnedExplorer[i] += Math.abs(wrapAngle(world.ants.heading[e] - prevExplorer[i]));
      turnedFollower[i] += Math.abs(wrapAngle(world.ants.heading[f] - prevFollower[i]));
      prevExplorer[i] = world.ants.heading[e];
      prevFollower[i] = world.ants.heading[f];
    }
  }

  const meanExplorer = turnedExplorer.reduce((sum, value) => sum + value, 0) / count / seconds;
  const meanFollower = turnedFollower.reduce((sum, value) => sum + value, 0) / count / seconds;
  assert.ok(meanFollower > 0.05, `followers turn ${meanFollower} rad/s`);
  assert.ok(
    meanExplorer >= 3 * meanFollower,
    `explorers turn ${meanExplorer} rad/s, followers ${meanFollower} rad/s`,
  );
});

test("wander: no offset while the target is in direct sight", () => {
  const params = defaultParams();
  const world = makeWorld(params, 1);
  addFoodSource(world.food, { x: 120, y: 100 }, 500);
  const index = world.ants.spawn(
    { pos: { x: 100, y: 100 }, heading: 0 },
    1,
    params.antSpeed,
    params,
  );
  const events = makeChunkEvents();
  let reached = false;
  let ticks = 0;

  for (; ticks < 40; ticks++) {
    events.deposits.length = 0;
    events.degrades.length = 0;
    events.contacts.length = 0;
    thinkChunk(world, 0, 1, events);
    assert.ok(
      Math.abs(wrapAngle(world.ants.heading[index])) <= 0.05,
      `heading drifted to ${world.ants.heading[index]} on tick ${ticks}`,
    );
    if (events.contacts.some((contact) => contact.kind === ContactKind.Food)) {
      reached = true;
      break;
    }
  }

  assert.ok(reached, `food not reached within 40 ticks (stopped at ${ticks})`);
});
