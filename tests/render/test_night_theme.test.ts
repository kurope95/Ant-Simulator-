import test from "node:test";
import assert from "node:assert/strict";

import { nightTheme, sandTheme } from "../../src/render/theme.js";

test("theme: night is dark and its heat channels point different ways", () => {
  const night = nightTheme();
  assert.equal(night.outside.r, 0x05);
  assert.equal(night.ground.r, 0x0b);
  assert.equal(night.ground.g, 0x0f);
  assert.ok(night.heatHome.b > night.heatHome.r);
  assert.ok(night.heatFood.r > night.heatFood.b);
  assert.ok(night.ground.r < night.food.r);
  const sand = sandTheme();
  assert.equal(sand.ground.r, 0xe8);
  assert.equal(sand.heatHome.b, 0xe0);
  assert.equal(sand.heatFood.r, 0xe0);
});
