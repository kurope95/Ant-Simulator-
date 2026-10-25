import test from "node:test";
import assert from "node:assert/strict";

import { HeatmapMode } from "../../src/render/view_settings.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld } from "../../src/sim/world.js";
import {
  colonyRows,
  formatClock,
  formatInteger,
  speedLabel,
  trailModeLabel,
} from "../../src/ui/view_models.js";

test("format: integers group, clocks are mm:ss, labels are human", () => {
  assert.equal(formatInteger(0), "0");
  assert.equal(formatInteger(1234567), "1,234,567");
  assert.equal(formatClock(0, 60), "00:00");
  assert.equal(formatClock(3661, 60), "01:01");
  assert.equal(formatClock(6000, 60), "01:40");
  assert.equal(speedLabel(4), "4×");
  assert.equal(speedLabel("max"), "Max");
  assert.equal(trailModeLabel(HeatmapMode.Off), "Off");
  assert.equal(trailModeLabel(HeatmapMode.DualChannel), "Trail type");
  assert.equal(trailModeLabel(HeatmapMode.ColonyColor), "Colonies");
});

test("colonies: rows carry palette names, hex and stats in id order", () => {
  const world = makeWorld(defaultParams(), 1);
  const second = makeColony(1, { x: 20, y: 20 }, 2);
  second.population = 7;
  second.deliveredTotal = 11;
  second.foodPool = 3;
  world.colonies.push(makeColony(0, { x: 10, y: 10 }, 0), second);
  const rows = colonyRows(world);
  assert.equal(rows[1].name, "Azure");
  assert.equal(rows[1].hex, 0x4c8dde);
  assert.deepEqual([rows[1].population, rows[1].delivered, rows[1].foodPool], [7, 11, 3]);
});
