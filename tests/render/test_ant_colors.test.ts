import test from "node:test";
import assert from "node:assert/strict";

import { mixHex } from "../../src/core/color.js";
import { antColors } from "../../src/render/ant_colors.js";

test("ant colours: the gaster is the colony colour, the body is 55% toward dark brown", () => {
  const colors = antColors(0xe2603f); // Ember
  assert.equal(colors.gaster, "rgb(226,96,63)");
  assert.equal(colors.body, "rgb(116,53,35)");
  assert.equal(colors.outline, "rgb(11,8,6)");
  assert.equal(colors.sheen, "rgba(255,255,255,0.25)");
});

test("colour mix: t = 0 keeps a, t = 1 gives b, and halfway rounds", () => {
  assert.equal(mixHex(0xe2603f, 0x1a120c, 0), 0xe2603f);
  assert.equal(mixHex(0xe2603f, 0x1a120c, 1), 0x1a120c);
  assert.equal(mixHex(0xffffff, 0x000000, 0.5), 0x808080);
});
