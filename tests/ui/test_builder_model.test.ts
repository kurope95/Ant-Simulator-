import test from "node:test";
import assert from "node:assert/strict";

import { BuilderModel, BuilderTool, paintStepReached } from "../../src/ui/builder_model.js";
import { addColony, addFood, FoodKind, makeSetup } from "../../src/sim/setup.js";

function model() {
  const setup = makeSetup({ x: 400, y: 300 }, 1, "blank");
  return new BuilderModel(setup);
}

test("builder: the colony tool adds a colony and picks the next free colour", () => {
  const m = model();
  m.setTool(BuilderTool.Colony);
  assert.equal(m.applyAt({ x: 100, y: 100 }), true);
  m.applyAt({ x: 300, y: 200 });
  assert.deepEqual(
    m.setup.colonies.map((c) => [c.id, c.color]),
    [
      [0, 0],
      [1, 1],
    ],
  );
  assert.deepEqual(m.selection, { kind: "colony", id: 1 });
});

test("builder: deleting the selection clears it", () => {
  const m = model();
  addColony(m.setup, { x: 100, y: 100 });
  addColony(m.setup, { x: 300, y: 200 });
  m.selectAt({ x: 100, y: 100 }, 24);
  assert.deepEqual(m.selection, { kind: "colony", id: 0 });
  assert.equal(m.deleteSelection(), true);
  assert.equal(m.selection, null);
  assert.equal(m.setup.colonies.length, 1);
});

test("builder: deleting a selection clears a pending preset confirm", () => {
  const m = model();
  m.setTool(BuilderTool.Colony);
  m.applyAt({ x: 100, y: 100 });
  assert.equal(m.requestPreset("dunes"), "confirm");
  assert.equal(m.pendingPreset(), "dunes");
  m.selectAt({ x: 100, y: 100 }, 24);
  assert.equal(m.deleteSelection(), true);
  assert.equal(m.selection, null);
  assert.equal(m.pendingPreset(), null);
});

test("builder: painting waits for a third of the brush radius", () => {
  assert.equal(paintStepReached({ x: 0, y: 0 }, { x: 0.59, y: 0 }, 2), false);
  assert.equal(paintStepReached({ x: 0, y: 0 }, { x: 0.6, y: 0 }, 2), true);
  assert.equal(paintStepReached({ x: 0, y: 0 }, { x: 0.36, y: 0.5 }, 2), true);
  assert.equal(paintStepReached({ x: 10, y: 10 }, { x: 10, y: 10 }, 0), true);
});

test("builder: food and terrain edits mark the map dirty", () => {
  const m = model();
  m.setTool(BuilderTool.Food);
  m.setFoodKind(FoodKind.Leaves);
  m.setFoodAmount(2500);
  m.applyAt({ x: 200, y: 150 });
  assert.equal(m.setup.food[0].kind, FoodKind.Leaves);
  assert.equal(m.setup.food[0].amount, 2500);
  m.setTool(BuilderTool.Rock);
  m.setBrushRadius(500);
  assert.equal(m.brushRadius, 64);
  assert.equal(m.paintAt({ x: 200, y: 150 }), true);
  assert.equal(m.dirty, true);
});

test("builder: a preset change asks before discarding edits", () => {
  const m = model();
  m.setTool(BuilderTool.Colony);
  m.applyAt({ x: 100, y: 100 });
  assert.equal(m.requestPreset("dunes"), "confirm");
  assert.equal(m.setup.presetId, "blank");
  assert.equal(m.pendingPreset(), "dunes");
  m.cancelPreset();
  assert.equal(m.pendingPreset(), null);
  assert.equal(m.setup.presetId, "blank");
  assert.equal(m.requestPreset("dunes"), "confirm");
  assert.equal(m.confirmPreset(), true);
  assert.equal(m.setup.presetId, "dunes");
  assert.equal(m.requestPreset("nope"), "unknown");
});

test("builder: selection colour and starting ants are bounded", () => {
  const m = model();
  addColony(m.setup, { x: 100, y: 100 });
  m.selectAt({ x: 100, y: 100 }, 24);
  m.setSelectionColor(9);
  assert.equal(m.setup.colonies[0].color, 7);
  m.setSelectionStartingAnts(5000);
  assert.equal(m.setup.colonies[0].startingAnts, 600);
});
