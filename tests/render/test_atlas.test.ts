import test from "node:test";
import assert from "node:assert/strict";
import { kAtlasHeight, kAtlasWidth, makeAtlasFrames, type AtlasFrame } from "../../src/render/atlas.js";
import { FoodKind } from "../../src/sim/setup.js";

test("atlas: all frames fit inside the page and never overlap", () => {
  const frames = makeAtlasFrames();
  const list: AtlasFrame[] = [];
  for (let c = 0; c < 8; c++) for (let v = 0; v < 2; v++) list.push(frames.antBody(c, v), frames.antSmall(c, v));
  for (let k = 0; k < 3; k++) for (let v = 0; v < 4; v++) list.push(frames.food(k as FoodKind, v));
  for (let c = 0; c < 8; c++) list.push(frames.nest(c));
  for (const f of list) {
    assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= kAtlasWidth && f.y + f.h <= kAtlasHeight);
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.equal(overlaps, false, `frames ${i} and ${j} overlap`);
  }
});

test("atlas: colony and variant select different body frames", () => {
  const f = makeAtlasFrames();
  assert.notDeepEqual(f.antBody(0, 0), f.antBody(2, 0));
  assert.notDeepEqual(f.antBody(0, 0), f.antBody(0, 1));
  assert.deepEqual(f.antBody(8, 2), f.antBody(0, 0));
});
