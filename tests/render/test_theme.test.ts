import test from "node:test";
import assert from "node:assert/strict";
import { rgba } from "../../src/core/color.js";
import {
  blankTheme,
  boulderTheme,
  creekTheme,
  dunesTheme,
  meadowTheme,
  themeForPreset,
  type Theme,
} from "../../src/render/theme.js";

const kThemes: readonly Theme[] = [
  meadowTheme(),
  dunesTheme(),
  creekTheme(),
  boulderTheme(),
  blankTheme(),
];

test("themes: the five presets have the designed ground and heat colours", () => {
  assert.equal(meadowTheme().ground.r, 0x0b);
  assert.equal(dunesTheme().ground.r, 0x2a);
  assert.equal(creekTheme().ground.r, 0x0d);
  assert.equal(boulderTheme().ground.r, 0x14);
  assert.equal(blankTheme().ground.r, 0x0b);
  const t = meadowTheme();
  assert.deepEqual(t.heatHome, rgba(0x4f, 0xc3, 0xb0, 255));
  assert.deepEqual(t.heatFood, rgba(0xf0, 0xb4, 0x5e, 255));
  assert.equal(t.heatAlpha, 0.62);
  assert.deepEqual(t.rock, rgba(0x2c, 0x30, 0x34, 255));
  assert.deepEqual(t.water, rgba(0x0f, 0x2f, 0x3c, 255));
  assert.equal(themeForPreset("creek").name, "Creek");
  assert.equal(themeForPreset("nope").name, "Meadow");
});

test("themes: every preset shares the outside, obstacle palette and trail colours", () => {
  for (const theme of kThemes) {
    assert.deepEqual(theme.outside, rgba(0x05, 0x07, 0x0a, 255));
    assert.deepEqual(theme.border, rgba(0xeb, 0xf1, 0xe5, 46));
    assert.deepEqual(theme.heatHome, rgba(0x4f, 0xc3, 0xb0, 255));
    assert.deepEqual(theme.heatFood, rgba(0xf0, 0xb4, 0x5e, 255));
    assert.equal(theme.heatAlpha, 0.62);
    assert.deepEqual(theme.rock, rgba(0x2c, 0x30, 0x34, 255));
    assert.deepEqual(theme.water, rgba(0x0f, 0x2f, 0x3c, 255));
    assert.deepEqual(theme.sand, rgba(0x3a, 0x31, 0x22, 255));
    assert.deepEqual(theme.mud, rgba(0x25, 0x1f, 0x17, 255));
  }
});

test("themes: each has a readable 6% grid and its own speckle and food tint", () => {
  for (const theme of kThemes) {
    assert.equal(theme.grid.a, 15);
    assert.ok(theme.grid.r > theme.ground.r);
    assert.ok(theme.grid.g > theme.ground.g);
    assert.ok(theme.grid.b > theme.ground.b);
    assert.deepEqual(theme.speckle.a, 255);
    assert.deepEqual(theme.food.a, 255);
    assert.notDeepEqual(theme.speckle, theme.ground);
    assert.notDeepEqual(theme.food, theme.ground);
  }
  assert.notDeepEqual(meadowTheme().speckle, dunesTheme().speckle);
  assert.notDeepEqual(meadowTheme().food, dunesTheme().food);
});

test("themes: every preset id maps to its own named theme", () => {
  assert.deepEqual(
    ["meadow", "dunes", "creek", "boulder", "blank"].map(
      (id) => themeForPreset(id).name,
    ),
    ["Meadow", "Dunes", "Creek", "Boulder", "Blank"],
  );
  assert.equal(themeForPreset("").name, "Meadow");
});
