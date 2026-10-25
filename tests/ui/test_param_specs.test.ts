import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams } from "../../src/sim/params.js";
import { loadScenario } from "../../src/sim/scenarios.js";
import { makeWorld, stepWorld, type World } from "../../src/sim/world.js";
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

test("param specs: ten unique controls with valid ranges and defaults", () => {
  const specs = paramSpecs();
  assert.equal(specs.length, 10);
  assert.equal(new Set(specs.map((spec) => spec.key)).size, 10);
  const defaults = defaultParams();
  for (const spec of specs) {
    assert.ok(["movement", "trails", "colony"].includes(spec.group), spec.key);
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
  const world = makeWorld(defaultParams(), 1);
  assert.equal(loadScenario(world, "sandbox"), null);
  const specs = paramSpecs();
  for (const spec of specs) applySpecValue(spec, world.params, spec.min);
  for (let i = 0; i < 300; i++) stepWorld(world);
  assertFiniteWorld(world);
  for (const spec of specs) applySpecValue(spec, world.params, spec.max);
  for (let i = 0; i < 300; i++) stepWorld(world);
  assertFiniteWorld(world);
});
