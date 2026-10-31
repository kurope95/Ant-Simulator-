import test from "node:test";
import assert from "node:assert/strict";

import { FixedStepClock } from "../../src/core/fixed_step.js";

function near(actual: number, expected: number, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);
}

test("fixed_step: two 120 Hz frames make one 60 Hz step", () => {
  const clock = new FixedStepClock(1 / 60, 16);
  assert.equal(clock.advance(1 / 120, 1), 0);
  near(clock.alpha(), 0.5);
  assert.equal(clock.advance(1 / 120, 1), 1);
  near(clock.alpha(), 0);
});

test("fixed_step: speed multiplies simulated time", () => {
  const clock = new FixedStepClock(1 / 60, 16);
  assert.equal(clock.advance(1 / 60, 2), 2);
  assert.equal(clock.advance(3 / 60, 1), 3);
});

test("fixed_step: a paused clock runs nothing and keeps alpha", () => {
  const clock = new FixedStepClock(1 / 60, 16);
  clock.advance(1 / 120, 1);
  assert.equal(clock.advance(5, 0), 0);
  near(clock.alpha(), 0.5);
});

test("fixed_step: a long stall is capped and the backlog dropped", () => {
  const clock = new FixedStepClock(1 / 60, 16);
  assert.equal(clock.advance(10, 1), 16);
  assert.ok(clock.alpha() >= 0);
  assert.ok(clock.alpha() < 1);
  assert.ok(clock.advance(1 / 60, 1) <= 2);
});

test("fixed_step: reset clears the accumulator", () => {
  const clock = new FixedStepClock(1 / 60, 16);
  clock.advance(1 / 120, 1);
  clock.reset();
  assert.equal(clock.alpha(), 0);
});

test("fixed_step: dropBacklog keeps less than one step, so a slow world falls behind instead of catching up", () => {
  const clock = new FixedStepClock(1 / 60, 16);
  assert.equal(clock.advance(0.1, 1), 6);
  clock.advance(0.05, 1);
  clock.dropBacklog();
  assert.ok(clock.alpha() < 1);
  assert.equal(clock.advance(1 / 60, 1) <= 2, true);
});
