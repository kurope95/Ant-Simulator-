import test from "node:test";
import assert from "node:assert/strict";

import type { Vec2 } from "../../src/core/vec2.js";
import { worldChecksum } from "../../src/sim/checksum.js";
import { guardRadius, makeColony, nestRadius } from "../../src/sim/colony.js";
import { MarkerChannel, battleAt, deposit, homeAt } from "../../src/sim/marker_grid.js";
import { defaultParams } from "../../src/sim/params.js";
import { loadPreset } from "../../src/sim/presets.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { directSightHeading, followerPattern, senseMarkers } from "../../src/sim/sensing.js";
import { spawnAtNest } from "../../src/sim/tick.js";
import { AntRole, AntState, Combat, kNoFoe } from "../../src/sim/types.js";
import { makeWorld, stepWorld, type World } from "../../src/sim/world.js";

// Two nests far apart on an open 1000 x 600 field; wander off so ants go straight.
function twoColonies(): World {
  const params = defaultParams();
  params.worldW = 1000;
  params.worldH = 600;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  params.antCollisions = false;
  const world = makeWorld(params, 3);
  world.colonies.push(makeColony(0, { x: 60, y: 300 }));
  world.colonies.push(makeColony(1, { x: 940, y: 300 }));
  world.markers.resize(world.size, params.markerCell, 2);
  return world;
}

function addAnt(world: World, colony: number, pos: Vec2, role = AntRole.Follower, heading = 0): number {
  const index = world.ants.spawn({ pos, colony, role, heading }, world.nextUid++, world.params.antSpeed, world.params);
  world.colonies[colony].population += 1;
  return index;
}

function uidOf(world: World, index: number): number {
  return world.ants.uid[index];
}

function at(world: World, uid: number): number {
  const index = world.ants.indexOf(uid);
  assert.notEqual(index, null, `ant ${uid} is gone`);
  return index!;
}

test("conflict: about a tenth of newborn ants are warriors", () => {
  const world = twoColonies();
  for (let i = 0; i < 2000; i++) spawnAtNest(world, world.colonies[0]);
  let warriors = 0;
  for (let i = 0; i < world.ants.size(); i++) if (world.ants.role[i] === AntRole.Warrior) warriors += 1;
  assert.ok(warriors > 160 && warriors < 240, `warriors ${warriors} of 2000`);
});

test("conflict: off, no warriors are born", () => {
  const world = twoColonies();
  world.params.conflict = false;
  for (let i = 0; i < 500; i++) spawnAtNest(world, world.colonies[0]);
  for (let i = 0; i < world.ants.size(); i++) assert.notEqual(world.ants.role[i], AntRole.Warrior);
});

test("conflict: a warrior walking out lays no trail", () => {
  const world = twoColonies();
  const uid = uidOf(world, addAnt(world, 0, { x: 300, y: 300 }, AntRole.Warrior));
  const worker = uidOf(world, addAnt(world, 0, { x: 300, y: 500 }, AntRole.Follower));
  for (let t = 0; t < 120; t++) stepWorld(world);
  const grid = world.markers;
  const warriorCell = grid.cellIndex({ x: world.ants.posX[at(world, uid)] - 20, y: world.ants.posY[at(world, uid)] });
  const workerCell = grid.cellIndex({ x: world.ants.posX[at(world, worker)] - 20, y: world.ants.posY[at(world, worker)] });
  assert.equal(homeAt(grid, 0, warriorCell), 0);
  assert.ok(homeAt(grid, 0, workerCell) > 0, "the worker's home trail is there");
});

test("conflict: a death leaves a body; a forager carries it home for its food value", () => {
  const world = twoColonies();
  const params = world.params;
  const victim = addAnt(world, 1, { x: 500, y: 300 });
  world.ants.energy[victim] = 0.001;
  stepWorld(world);
  assert.equal(world.corpses.items.length, 1);
  const body = world.corpses.items[0];
  assert.equal(body.value, params.corpseFood);
  assert.equal(world.colonies[1].diedOfHunger, 1);
  // A forager of the other colony steps on it and picks it up.
  const finder = uidOf(world, addAnt(world, 0, { x: body.x - 1, y: body.y }));
  stepWorld(world);
  const i = at(world, finder);
  assert.equal(world.ants.state[i], AntState.ReturningFood);
  assert.equal(world.ants.load[i], params.corpseFood);
  assert.equal(world.corpses.items.length, 0, "the body is gone once picked up");
  // Delivered at home it adds its whole value.
  const nest = world.colonies[0].nest;
  world.ants.posX[i] = nest.x;
  world.ants.posY[i] = nest.y;
  const before = world.colonies[0].foodPool;
  stepWorld(world);
  const meal = world.colonies[0].foodPool - before;
  assert.ok(meal > params.corpseFood - 0.1 && meal <= params.corpseFood, `stores rose by ${meal}`);
  assert.equal(world.ants.load[i], 0);
});

test("conflict: an uncollected body rots away", () => {
  const world = twoColonies();
  const victim = addAnt(world, 1, { x: 500, y: 300 });
  world.ants.energy[victim] = 0.001;
  stepWorld(world);
  assert.equal(world.corpses.items.length, 1);
  for (let t = 0; t < world.params.corpseLifetime * world.params.simHz + 2; t++) stepWorld(world);
  assert.equal(world.corpses.items.length, 0);
});

test("conflict: two guards meet in a standoff, unharmed, then fight", () => {
  const world = twoColonies();
  const params = world.params;
  const a = uidOf(world, addAnt(world, 0, { x: 495, y: 300 }, AntRole.Warrior, 0));
  const b = uidOf(world, addAnt(world, 1, { x: 510, y: 300 }, AntRole.Warrior, Math.PI));
  stepWorld(world);
  assert.equal(world.ants.combat[at(world, a)], Combat.Standoff);
  assert.equal(world.ants.combat[at(world, b)], Combat.Standoff);
  for (let t = 0; t < (params.standoffTime - 0.5) * params.simHz; t++) stepWorld(world);
  assert.equal(world.ants.wounds[at(world, a)], 0, "nobody is hurt during the standoff");
  assert.equal(world.ants.wounds[at(world, b)], 0);
  for (let t = 0; t < 2 * params.simHz; t++) stepWorld(world);
  assert.ok(world.ants.wounds[at(world, a)] > 0 && world.ants.wounds[at(world, b)] > 0, "they bite");
  assert.ok(battleAt(world.markers, 0, world.markers.cellIndex({ x: 500, y: 300 })) > 0, "battle smell is laid");
});

test("conflict: a bitten ant turns on its attacker", () => {
  const world = twoColonies();
  const attacker = addAnt(world, 0, { x: 500, y: 300 }, AntRole.Warrior);
  const victim = addAnt(world, 1, { x: 506, y: 300 }, AntRole.Follower);
  world.ants.combat[attacker] = Combat.Fight;
  world.ants.combatTimer[attacker] = 3;
  world.ants.foe[attacker] = world.ants.uid[victim];
  const victimUid = world.ants.uid[victim];
  const attackerUid = world.ants.uid[attacker];
  stepWorld(world);
  const v = at(world, victimUid);
  assert.ok(world.ants.wounds[v] > 0);
  assert.ok(world.ants.fear[v] > 0);
  assert.equal(world.ants.foe[v], attackerUid);
  assert.notEqual(world.ants.combat[v], Combat.None);
});

test("conflict: an outnumbered ant backs off instead of fighting", () => {
  const world = twoColonies();
  const lone = uidOf(world, addAnt(world, 0, { x: 500, y: 300 }, AntRole.Warrior, 0));
  for (let k = 0; k < 5; k++) addAnt(world, 1, { x: 515 + 3 * k, y: 290 + 5 * k }, AntRole.Warrior, Math.PI);
  for (let t = 0; t < 30; t++) stepWorld(world);
  const i = world.ants.indexOf(lone);
  if (i !== null) assert.equal(world.ants.combat[i], Combat.Retreat);
});

test("conflict: a killed ant is counted as a fight death and its killer lets go", () => {
  const world = twoColonies();
  const killer = uidOf(world, addAnt(world, 0, { x: 500, y: 300 }, AntRole.Warrior));
  const victim = addAnt(world, 1, { x: 506, y: 300 }, AntRole.Follower);
  world.ants.energy[victim] = 0.5;
  const k = at(world, killer);
  world.ants.combat[k] = Combat.Fight;
  world.ants.combatTimer[k] = 3;
  world.ants.foe[k] = world.ants.uid[victim];
  for (let t = 0; t < 30; t++) stepWorld(world);
  assert.equal(world.colonies[1].diedInFight, 1);
  assert.equal(world.corpses.items.length, 1, "the victim lies where it fell");
  assert.equal(world.ants.combat[at(world, killer)], Combat.Cooldown, "it lets go and cools down");
  assert.equal(world.ants.foe[at(world, killer)], kNoFoe);
});

test("conflict: a rival cannot walk into a nest", () => {
  const world = twoColonies();
  const nest = world.colonies[0].nest;
  const rival = uidOf(world, addAnt(world, 1, { x: nest.x + 2, y: nest.y }, AntRole.Explorer, Math.PI));
  const own = uidOf(world, addAnt(world, 0, { x: nest.x + 2, y: nest.y + 1 }, AntRole.Follower, Math.PI));
  stepWorld(world);
  const r = at(world, rival);
  const dist = Math.hypot(world.ants.posX[r] - nest.x, world.ants.posY[r] - nest.y);
  assert.ok(dist >= nestRadius(world.colonies[0], world.params), `rival is ${dist} u from the nest centre`);
  const o = at(world, own);
  assert.ok(Math.hypot(world.ants.posX[o] - nest.x, world.ants.posY[o] - nest.y) < 10, "own ants pass as before");
});

test("conflict: workers attack a raider inside the nest's safety ring", () => {
  const world = twoColonies();
  const colony = world.colonies[0];
  const ring = guardRadius(colony, world.params);
  const x = colony.nest.x + ring * 0.6;
  const worker = uidOf(world, addAnt(world, 0, { x, y: 300 }, AntRole.Follower, 0));
  addAnt(world, 1, { x: x + 15, y: 300 }, AntRole.Follower, Math.PI);
  stepWorld(world);
  // Boldness is a fixed draw per ant; this seed's worker is bold enough.
  assert.equal(world.ants.combat[at(world, worker)], Combat.Fight, "no standoff when defending the nest");
});

test("conflict: battle smell fades within half a minute and never owns ground", () => {
  const world = twoColonies();
  const cell = world.markers.cellIndex({ x: 500, y: 300 });
  deposit(world.markers, cell, 0, MarkerChannel.Battle, 1, world.params);
  stepWorld(world);
  assert.equal(world.markers.owner[cell], -1);
  for (let t = 0; t < 40 * world.params.simHz; t++) stepWorld(world);
  assert.equal(battleAt(world.markers, 0, cell), 0);
});

test("conflict: a short meal at home stresses an ant; the nest shares feelings", () => {
  const world = twoColonies();
  const colony = world.colonies[0];
  const ant = addAnt(world, 0, { x: colony.nest.x, y: colony.nest.y });
  world.ants.state[ant] = AntState.ReturningExhausted;
  world.ants.energy[ant] = 30;
  colony.foodPool = 0.1; // a tenth of what it needs
  stepWorld(world);
  assert.ok(world.ants.stress[ant] > 0.3, `stress ${world.ants.stress[ant]}`);
  assert.ok(colony.nestStress > 0, "the nest takes some of it");
});

test("conflict: two colonies replay identically from the same seed", { timeout: 120_000 }, () => {
  const a = worldFromSetup(loadPreset("dunes", 4)!, defaultParams());
  const b = worldFromSetup(loadPreset("dunes", 4)!, defaultParams());
  for (let t = 0; t < 2400; t++) {
    stepWorld(a);
    stepWorld(b);
  }
  assert.equal(worldChecksum(a), worldChecksum(b));
  assert.equal(a.colonies[0].diedInFight + a.colonies[1].diedInFight, b.colonies[0].diedInFight + b.colonies[1].diedInFight);
});

test("conflict: a guarding warrior walks the column's edge, a worker its middle", () => {
  const world = twoColonies();
  const grid = world.markers;
  // A food column along y = 300: strongest in the middle, fading to nothing 40 u out.
  for (let x = 0; x < 1000; x += grid.cell) {
    for (let y = 260; y <= 340; y += grid.cell) {
      const cell = grid.cellIndex({ x, y });
      grid.toFood[cell] = Math.max(0, 1 - Math.abs(y - 300) / 40);
    }
  }
  const warrior = addAnt(world, 0, { x: 500, y: 300 }, AntRole.Warrior, 0);
  const worker = addAnt(world, 0, { x: 500, y: 300 }, AntRole.Follower, 0);
  const pattern = followerPattern(world.params);
  const guard = senseMarkers(world, warrior, MarkerChannel.ToFood, pattern);
  const work = senseMarkers(world, worker, MarkerChannel.ToFood, pattern);
  assert.ok(guard.found && work.found);
  assert.ok(Math.abs(work.targetHeading) < 0.05, `worker heading ${work.targetHeading}`);
  assert.ok(Math.abs(guard.targetHeading) > 0.2, `warrior heading ${guard.targetHeading}`);
  world.params.guardEdge = 0;
  const centre = senseMarkers(world, warrior, MarkerChannel.ToFood, pattern);
  assert.ok(Math.abs(centre.targetHeading) < 0.05, "guardEdge 0 walks the middle");
});

test("conflict: warriors never rest; fighting at the nest calls resting ants out", () => {
  const world = twoColonies();
  const colony = world.colonies[0];
  colony.foodPool = 100;
  const warrior = addAnt(world, 0, { x: colony.nest.x, y: colony.nest.y }, AntRole.Warrior);
  world.ants.state[warrior] = AntState.ReturningExhausted;
  stepWorld(world);
  assert.notEqual(world.ants.state[at(world, world.ants.uid[warrior])], AntState.Resting);
  // Ten workers resting at home; battle smell at the nest calls them out.
  const resting: number[] = [];
  for (let i = 0; i < 10; i++) {
    const worker = addAnt(world, 0, { x: colony.nest.x, y: colony.nest.y });
    world.ants.state[worker] = AntState.ReturningExhausted;
    resting.push(world.ants.uid[worker]);
  }
  world.params.scoutRate = 0;
  stepWorld(world);
  assert.equal(colony.resting, 10);
  const cell = world.markers.cellIndex(colony.nest);
  for (let t = 0; t < world.params.simHz; t++) {
    deposit(world.markers, cell, 0, MarkerChannel.Battle, 1, world.params);
    stepWorld(world);
  }
  const out = 10 - colony.resting;
  assert.ok(out >= world.params.defendCallRate - 1 && out <= world.params.defendCallRate + 1, `${out} defenders in 1 s`);
});

test("conflict: a pursuer that cannot catch its foe gives up and starts no new fight while cooling down", () => {
  const world = twoColonies();
  const params = world.params;
  const chaser = uidOf(world, addAnt(world, 0, { x: 300, y: 300 }, AntRole.Warrior, 0));
  const runner = uidOf(world, addAnt(world, 1, { x: 330, y: 300 }, AntRole.Follower, 0));
  const c = at(world, chaser);
  world.ants.combat[c] = Combat.Fight;
  world.ants.combatTimer[c] = params.chaseTime;
  world.ants.foe[c] = runner;
  // The runner is far faster: it can never be caught.
  world.ants.speed[at(world, runner)] = 400;
  for (let t = 0; t < (params.chaseTime + 0.5) * params.simHz; t++) stepWorld(world);
  assert.equal(world.ants.combat[at(world, chaser)], Combat.Cooldown);
  // Cooling down, it ignores a rival warrior right in front of it.
  const i = at(world, chaser);
  addAnt(world, 1, { x: world.ants.posX[i] + 12, y: world.ants.posY[i] }, AntRole.Warrior, Math.PI);
  stepWorld(world);
  assert.equal(world.ants.combat[at(world, chaser)], Combat.Cooldown);
  for (let t = 0; t < params.fightCooldown * params.simHz; t++) stepWorld(world);
  assert.notEqual(world.ants.combat[at(world, chaser)], Combat.Cooldown, "after the cool-down it may fight again");
});

test("conflict: once biting has started an outnumbered ant fights on; only bad wounds make it run", () => {
  const world = twoColonies();
  const lone = uidOf(world, addAnt(world, 0, { x: 500, y: 300 }, AntRole.Warrior, 0));
  const foe = addAnt(world, 1, { x: 506, y: 300 }, AntRole.Warrior, Math.PI);
  const l = at(world, lone);
  world.ants.combat[l] = Combat.Fight;
  world.ants.combatTimer[l] = world.params.chaseTime;
  world.ants.foe[l] = world.ants.uid[foe];
  for (let k = 0; k < 5; k++) addAnt(world, 1, { x: 512 + 3 * k, y: 292 + 4 * k }, AntRole.Follower, Math.PI);
  stepWorld(world);
  assert.equal(world.ants.combat[at(world, lone)], Combat.Fight, "outnumbered, but already biting: it fights on");
  world.ants.wounds[at(world, lone)] = world.ants.energy[at(world, lone)] - 10;
  stepWorld(world);
  assert.equal(world.ants.combat[at(world, lone)], Combat.Retreat, "badly hurt: now it runs");
});

test("conflict: a worker spots a body lying close by, whichever way it faces", () => {
  const world = twoColonies();
  const victim = addAnt(world, 1, { x: 500, y: 300 });
  world.ants.energy[victim] = 0.001;
  stepWorld(world);
  assert.equal(world.corpses.items.length, 1);
  const body = world.corpses.items[0];
  const worker = addAnt(world, 0, { x: body.x, y: body.y + 12 }, AntRole.Follower, 0);
  assert.notEqual(directSightHeading(world, worker), null);
});
