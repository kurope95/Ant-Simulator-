import test from "node:test";
import assert from "node:assert/strict";
import { rgb, rgba } from "../../src/core/color.js";
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
  assert.equal(themeForPreset("creek").name, "Creek");
  assert.equal(themeForPreset("nope").name, "Meadow");
});

test("themes: every preset shares the outside, border and trail colours", () => {
  for (const theme of kThemes) {
    assert.deepEqual(theme.outside, rgba(0x05, 0x07, 0x0a, 255));
    assert.deepEqual(theme.border, rgba(0xeb, 0xf1, 0xe5, 46));
    assert.deepEqual(theme.heatHome, rgba(0x4f, 0xc3, 0xb0, 255));
    assert.deepEqual(theme.heatFood, rgba(0xf0, 0xb4, 0x5e, 255));
    assert.equal(theme.heatAlpha, 0.62);
  }
});

test("themes: each preset carries its own terrain palette", () => {
  const palettes: [Theme, number[]][] = [
    [meadowTheme(), [0x141c12, 0x1d2918, 0x3a3d40, 0x8a8f94, 0x2f7d85, 0x123b4a, 0x8c7650, 0x3e3022]],
    [dunesTheme(), [0x2b2116, 0x3a2c1c, 0x4a4036, 0xa39580, 0x3c8a8c, 0x17434f, 0xb39a68, 0x4a3827]],
    [creekTheme(), [0x121a16, 0x1a2620, 0x383d3d, 0x858c8a, 0x3a8f96, 0x0f3a4a, 0x8a7a58, 0x3a2f24]],
    [boulderTheme(), [0x16191b, 0x1f2428, 0x45494d, 0x9aa0a5, 0x357a86, 0x133847, 0x857457, 0x3b3026]],
    [blankTheme(), [0x0f1213, 0x15191a, 0x3a3e41, 0x868b8f, 0x2f7a84, 0x11384a, 0x857350, 0x382d22]],
  ];
  for (const [theme, hex] of palettes) {
    const actual = [
      theme.groundA,
      theme.groundB,
      theme.rockDark,
      theme.rockLight,
      theme.waterShallow,
      theme.waterDeep,
      theme.sand,
      theme.mud,
    ];
    assert.deepEqual(actual, hex.map((value) => rgb(value)));
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
