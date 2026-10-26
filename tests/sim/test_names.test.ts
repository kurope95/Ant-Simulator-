import test from "node:test";
import assert from "node:assert/strict";

import { antName } from "../../src/sim/names.js";

test("names: the same uid always gives the same name", () => {
  for (const uid of [0, 1, 63, 64, 999, 123456]) {
    assert.equal(antName(uid), antName(uid));
  }
});

test("names: non-empty plain ASCII", () => {
  for (let uid = 0; uid < 300; uid++) {
    assert.match(antName(uid), /^[A-Za-z][A-Za-z ]*[A-Za-z0-9]$/);
  }
});

test("names: the first 1000 uids give at least 900 distinct names", () => {
  const seen = new Set<string>();
  for (let uid = 0; uid < 1000; uid++) seen.add(antName(uid));
  assert.ok(seen.size >= 900, `only ${seen.size} distinct names`);
});

test("names: the first block of 64 uids has no repeats", () => {
  const seen = new Set<string>();
  for (let uid = 0; uid < 64; uid++) seen.add(antName(uid));
  assert.equal(seen.size, 64);
});
