import test from "node:test";
import assert from "node:assert/strict";

import {
  Screen,
  editRun,
  finishRun,
  newSession,
  pauseRun,
  restartRun,
  startRun,
  summarizeRun,
} from "../../src/app/session.js";
import { addColony, addFood, FoodKind, makeSetup } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { defaultParams } from "../../src/sim/params.js";
import { stepWorld } from "../../src/sim/world.js";

function validSetup() {
  const setup = makeSetup({ x: 400, y: 300 }, 5, "meadow");
  addColony(setup, { x: 100, y: 100 });
  addFood(setup, { x: 300, y: 200 }, 4000, FoodKind.Seeds);
  return setup;
}

test("session: start refuses an invalid map and names the reason", () => {
  const empty = makeSetup({ x: 400, y: 300 }, 1);
  const denied = startRun(newSession(Screen.Builder), empty);
  assert.equal(denied.error, "Add at least one colony.");
  assert.equal(denied.state.screen, Screen.Builder);
  const okay = startRun(newSession(Screen.Builder), validSetup());
  assert.equal(okay.error, null);
  assert.equal(okay.state.screen, Screen.Run);
  assert.equal(okay.state.paused, false);
});

test("session: paused run transitions keep the map and clear stale state", () => {
  let s = startRun(newSession(Screen.Builder), validSetup()).state;
  s = pauseRun(s);
  assert.equal(s.paused, true);
  s = editRun(s);
  assert.equal(s.screen, Screen.Builder);
  const back = startRun(s, validSetup()).state;
  assert.equal(back.screen, Screen.Run);
  assert.equal(back.paused, false);
  const paused = pauseRun(back);
  const restarted = restartRun(paused);
  assert.equal(restarted.screen, Screen.Run);
  assert.equal(restarted.paused, false);
});

test("session: finish records the run and returns home", () => {
  let s = startRun(newSession(Screen.Builder), validSetup()).state;
  const summary = {
    presetName: "Meadow",
    seed: 5,
    seconds: 12,
    ants: 200,
    delivered: 4,
    colonies: 1,
  };
  s = finishRun(pauseRun(s), summary);
  assert.equal(s.screen, Screen.Home);
  assert.deepEqual(s.lastRun, summary);
});

test("session: summarizeRun reports the live world", () => {
  const setup = validSetup();
  const world = worldFromSetup(setup, defaultParams());
  for (let i = 0; i < 60; i++) stepWorld(world);
  const summary = summarizeRun(world, setup);
  assert.equal(summary.presetName, "Meadow");
  assert.equal(summary.seconds, 1);
  assert.equal(summary.ants, world.ants.size());
  assert.equal(summary.colonies, 1);
});
