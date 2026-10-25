import test from "node:test";
import assert from "node:assert/strict";

import { randU32 } from "../../src/core/rng.js";
import { Ants } from "../../src/sim/ants.js";
import { defaultParams } from "../../src/sim/params.js";
import { AntRole, AntState } from "../../src/sim/types.js";

test("ants: spawn appends an ant with defaults", () => {
  const ants = new Ants();
  const params = defaultParams();
  const index = ants.spawn({ pos: { x: 10, y: 20 } }, 7, 50, params);
  assert.equal(index, 0);
  assert.equal(ants.size(), 1);
  assert.equal(ants.uid[0], 7);
  assert.equal(ants.posX[0], 10);
  assert.equal(ants.posY[0], 20);
  assert.equal(ants.prevX[0], 10);
  assert.equal(ants.energy[0], params.energyMax);
  assert.equal(ants.mass[0], params.mass);
  assert.equal(ants.state[0], AntState.Foraging);
  assert.equal(ants.role[0], AntRole.Follower);
  assert.equal(ants.colony[0], 0);
  assert.equal(ants.speed[0], 50);
  assert.equal(ants.lastMarkerCell[0], -1);
});

test("ants: spawn grows the arrays past their capacity", () => {
  const ants = new Ants(1);
  for (let i = 0; i < 5; i++) {
    ants.spawn({ pos: { x: i, y: 0 } }, 100 + i, 10, defaultParams());
  }
  assert.equal(ants.size(), 5);
  assert.equal(ants.posX[0], 0);
  assert.equal(ants.posX[4], 4);
  assert.equal(ants.uid[4], 104);
});

test("ants: removeSwap moves the last ant into the hole", () => {
  const ants = new Ants();
  const params = defaultParams();
  for (let i = 0; i < 3; i++) ants.spawn({ pos: { x: i, y: i } }, 10 + i, 10, params);
  ants.removeSwap(0);
  assert.equal(ants.size(), 2);
  assert.equal(ants.indexOf(10), null);
  assert.equal(ants.indexOf(12), 0);
  assert.equal(ants.uid[0], 12);
  assert.equal(ants.posX[0], 2);
  assert.equal(ants.indexOf(11), 1);
});

test("ants: the uid map survives 1,000 mixed spawns and removals", () => {
  const ants = new Ants(4);
  const params = defaultParams();
  const expected = new Map<number, { x: number; y: number }>();
  let nextUid = 1;
  for (let step = 0; step < 1000; step++) {
    const op = randU32(1, step, 0, 7) % 3;
    if (op !== 0 || expected.size === 0) {
      const pos = { x: step, y: step * 2 };
      const uid = nextUid++;
      ants.spawn({ pos }, uid, 50, params);
      expected.set(uid, pos);
    } else {
      const uids = [...expected.keys()];
      const victim = uids[randU32(2, step, 0, 7) % uids.length];
      const index = ants.indexOf(victim);
      assert.notEqual(index, null);
      ants.removeSwap(index!);
      expected.delete(victim);
    }
    assert.equal(ants.size(), expected.size);
    for (const [uid, pos] of expected) {
      const index = ants.indexOf(uid);
      assert.notEqual(index, null);
      assert.equal(ants.uid[index!], uid);
      assert.equal(ants.posX[index!], pos.x);
      assert.equal(ants.posY[index!], pos.y);
    }
  }
});
