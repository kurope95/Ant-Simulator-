import test from "node:test";
import assert from "node:assert/strict";

import { angleDiff } from "../../src/core/math.js";
import { randRange } from "../../src/core/rng.js";
import { makeColony } from "../../src/sim/colony.js";
import { rebuildBorder } from "../../src/sim/obstacles.js";
import { defaultParams } from "../../src/sim/params.js";
import { ObstacleKind } from "../../src/sim/setup.js";
import { RandStream } from "../../src/sim/types.js";
import { makeWorld, stepWorld } from "../../src/sim/world.js";

function stuckWorld(seed: number) {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  return { world: makeWorld(params, seed, { x: 400, y: 300 }), params };
}

function spawn(world: ReturnType<typeof stuckWorld>["world"], x: number, y: number, heading = 0): number {
  return world.ants.spawn({ pos: { x, y }, heading }, world.nextUid++, world.params.antSpeed, world.params);
}

test("stuck: a jam at the nest never degrades", () => {
  const { world } = stuckWorld(3);
  world.colonies.push(makeColony(0, { x: 100, y: 100 }));
  const ants: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    ants.push(spawn(world, 100 + Math.cos(angle) * 5, 100 + Math.sin(angle) * 5, angle));
  }
  for (const index of ants) world.ants.timeSinceLastMarker[index] = 3;
  stepWorld(world);
  for (const index of ants) {
    assert.equal(world.ants.degradeTimer[index], 0, `ant ${index} started degrading`);
  }
});

test("stuck: a solo ant away from any zone starts degrading", () => {
  const { world, params } = stuckWorld(4);
  const index = spawn(world, 200, 150);
  world.ants.timeSinceLastMarker[index] = 3;
  stepWorld(world);
  assert.equal(world.ants.degradeTimer[index], params.degradeTime);
  assert.equal(world.ants.timeSinceLastMarker[index], 0);
});

test("stuck: a dead end degrades the trail it followed", () => {
  const { world } = stuckWorld(5);
  const grid = world.obstacles;
  const col = 55;
  const row = 37;
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (r !== row || c !== col) grid.kind[r * grid.width + c] = ObstacleKind.Rock;
    }
  }
  rebuildBorder(grid);
  const x = col * grid.cell + grid.cell / 2;
  const y = row * grid.cell + grid.cell / 2;
  const index = spawn(world, x, y);
  const cell = world.markers.cellIndex({ x, y });
  assert.ok(cell >= 0);
  world.markers.owner[cell] = 0;
  world.markers.toFood[cell] = 1;

  for (let tick = 0; tick < 300; tick++) stepWorld(world);

  assert.ok(
    world.markers.toFood[cell] <= 0.5 + 1e-6,
    `toFood is still ${world.markers.toFood[cell]} after 5 s in a dead end`,
  );
});

test("stuck: the turn uses StuckTurn", () => {
  const { world, params } = stuckWorld(42);
  const index = spawn(world, 200, 150, 0.35);
  const uid = world.ants.uid[index];
  world.ants.timeSinceLastMarker[index] = 3;
  stepWorld(world);
  const expected = 0.35 + Math.PI + randRange(42, uid, 1, RandStream.StuckTurn, -params.stuckTurnJitter, params.stuckTurnJitter);
  assert.ok(
    Math.abs(angleDiff(world.ants.heading[index], expected)) < 1e-6,
    `heading ${world.ants.heading[index]} vs ${expected}`,
  );
});
