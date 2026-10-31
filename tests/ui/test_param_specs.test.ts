import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams } from "../../src/sim/params.js";
import { quickStartSetup } from "../../src/sim/presets.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { stepWorld, type World } from "../../src/sim/world.js";
import {
  applySpecValue,
  formatSpecValue,
  paramSpecs,
  specValue,
} from "../../src/ui/param_specs.js";

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

function assertFiniteWorld(world: World): void {
  assert.ok(Number.isFinite(world.timings.totalMs));
  for (let i = 0; i < world.ants.size(); i++) {
    for (const value of [
      world.ants.posX[i],
      world.ants.posY[i],
      world.ants.heading[i],
      world.ants.energy[i],
      world.ants.mass[i],
    ]) {
      assert.ok(Number.isFinite(value), `ant ${i}`);
    }
  }
}

test("param specs: twenty-one live controls with valid ranges and defaults", () => {
  const specs = paramSpecs();
  assert.equal(specs.length, 21);
  assert.equal(new Set(specs.map((spec) => spec.key)).size, 21);
  assert.ok(specs.some((spec) => spec.key === "degradeTime"));
  const defaults = defaultParams();
  for (const spec of specs) {
    assert.ok(["behaviour", "movement", "trails", "colony"].includes(spec.group), spec.key);
    assert.ok(spec.min < spec.max, spec.key);
    assert.ok(spec.step > 0, spec.key);
    assert.ok(spec.scale > 0, spec.key);
    const display = specValue(spec, defaults);
    assert.ok(display >= spec.min && display <= spec.max, spec.key);
    const params = { ...defaults };
    const stored = applySpecValue(spec, params, display);
    assert.ok(Math.abs(stored - defaults[spec.key]) < 1e-5, spec.key);
  }
});

test("param specs: explorer ratio is edited as a percentage", () => {
  const spec = paramSpecs().find((candidate) => candidate.key === "explorerRatio");
  assert.ok(spec);
  const params = defaultParams();
  assert.equal(specValue(spec, params), 10);
  assert.equal(applySpecValue(spec, params, 0), 0);
  assert.equal(params.explorerRatio, 0);
  assert.equal(formatSpecValue(spec, 25), "25 %");
});

test("param specs: trail fade edits the emission decay in thousandths", () => {
  const spec = paramSpecs().find((candidate) => candidate.key === "emissionDecay");
  assert.ok(spec);
  assert.equal(spec.label, "Scent weakens on the way");
  assert.equal(spec.group, "trails");
  assert.equal(spec.min, 0.005);
  assert.equal(spec.max, 0.2);
  const params = defaultParams();
  assert.equal(specValue(spec, params), 0.11);
  near(applySpecValue(spec, params, 99), 0.2);
  near(applySpecValue(spec, params, 0), 0.005);
  near(applySpecValue(spec, params, 0.031), 0.03);
  assert.equal(formatSpecValue(spec, specValue(spec, params)), "0.030");
});

test("param specs: values clamp and snap to the step", () => {
  const spec = paramSpecs().find((candidate) => candidate.key === "energyBurn");
  assert.ok(spec);
  const params = defaultParams();
  near(applySpecValue(spec, params, 99), 5);
  near(applySpecValue(spec, params, -3), 0.1);
  near(applySpecValue(spec, params, 1.26), 1.3);
  near(params.energyBurn, 1.3);
});

test("every extreme still steps the sandbox without NaN", () => {
  const world = worldFromSetup(quickStartSetup(1), defaultParams());
  const specs = paramSpecs();
  for (const spec of specs) applySpecValue(spec, world.params, spec.min);
  for (let i = 0; i < 300; i++) stepWorld(world);
  assertFiniteWorld(world);
  for (const spec of specs) applySpecValue(spec, world.params, spec.max);
  for (let i = 0; i < 300; i++) stepWorld(world);
  assertFiniteWorld(world);
});

test("param specs: degrade after is live and round-trips", () => {
  const spec = paramSpecs().find((candidate) => candidate.key === "degradeTime");
  assert.ok(spec);
  assert.equal(spec.label, "Stuck ants erase their trail for");
  assert.equal(spec.unit, "s");
  assert.equal(spec.min, 0.5);
  assert.equal(spec.max, 10);
  assert.equal(spec.step, 0.5);
  assert.equal(spec.group, "trails");
  const params = defaultParams();
  assert.equal(specValue(spec, params), 3);
  assert.equal(applySpecValue(spec, params, 4.2), 4);
  assert.equal(params.degradeTime, 4);
  assert.equal(formatSpecValue(spec, 4), "4.0 s");
});

test("param specs: avoidance look-ahead runs 0.25 to 2.5 s in 0.05 s steps", () => {
  const spec = paramSpecs().find((candidate) => candidate.key === "tHorizon");
  assert.ok(spec);
  assert.equal(spec.min, 0.25);
  assert.equal(spec.max, 2.5);
  assert.equal(spec.step, 0.05);
  const params = defaultParams();
  assert.equal(applySpecValue(spec, params, 9), 2.5);
  assert.equal(params.tHorizon, 2.5);
  assert.equal(applySpecValue(spec, params, 0.5), 0.5);
});

test("param specs: every control explains itself in one plain sentence", () => {
  for (const spec of paramSpecs()) {
    assert.ok(spec.hint !== undefined && spec.hint.length > 20, `${spec.key} has no explanation`);
  }
});
