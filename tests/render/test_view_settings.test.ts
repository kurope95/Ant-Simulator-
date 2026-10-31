import test from "node:test";
import assert from "node:assert/strict";

import {
  HeatmapMode,
  cycleHeatmap,
  defaultViewSettings,
} from "../../src/render/view_settings.js";

test("view settings: defaults and the heatmap cycle", () => {
  const settings = defaultViewSettings();
  assert.equal(settings.heatmap, HeatmapMode.ColonyColor);
  assert.equal(settings.showAnts, true);
  assert.equal(settings.showGrid, false);
  assert.equal(settings.showHash, false);
  assert.equal(settings.showColliders, false);
  assert.equal(cycleHeatmap(HeatmapMode.Off), HeatmapMode.ColonyColor);
  assert.equal(cycleHeatmap(HeatmapMode.DualChannel), HeatmapMode.Off);
  assert.equal(cycleHeatmap(HeatmapMode.ColonyColor), HeatmapMode.DualChannel);
});
