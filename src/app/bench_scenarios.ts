import { exemptAtNest } from "../sim/collide.js";
import { defaultParams, type SimParams } from "../sim/params.js";
import { loadPreset } from "../sim/presets.js";
import { AntRole, AntState } from "../sim/types.js";
import { worldFromSetup } from "../sim/setup_apply.js";
import { SpatialHash } from "../sim/spatial_hash.js";
import type { World } from "../sim/world.js";

// Hidden scenarios for the bench and the reach harness. They are not in the
// menu. The crowd scenario is the highway map with the ant count held fixed,
// so crowding can be measured without food or births changing the population.

export const kCrowdDefaultAnts = 2000;
export const kCrowdMaxAnts = 20000;

// Builds the crowd world: `count` ants spread evenly along the corridor, even
// uids foraging east and odd uids carrying west (mass 3). Infinite food,
// no energy burn and no births keep the population at `count`.
export function crowdWorld(seed: number, count: number): World {
  const setup = loadPreset("highway", seed);
  if (setup === null) throw new Error("the highway preset is missing");
  setup.paramOverrides = { ...setup.paramOverrides, energyBurn: 0, spawnCost: 1e9 };
  const params: SimParams = defaultParams();
  const world = worldFromSetup(setup, params, { spawnAnts: false });
  // Infinite food: the source never empties and keeps its small touch radius.
  for (const source of world.food.items) source.infinite = true;
  const corridor = { minX: 420, maxX: 1980, minY: 376, maxY: 524 };
  const n = Math.max(0, Math.min(Math.trunc(count), kCrowdMaxAnts));
  for (let i = 0; i < n; i++) {
    const uid = world.nextUid++;
    const t = (i + 0.5) / n;
    // A golden-ratio sequence spreads the lateral positions evenly, so no two
    // ants start on the same line.
    const lateral = (i * 0.618034) % 1;
    const x = corridor.minX + t * (corridor.maxX - corridor.minX);
    const y = corridor.minY + lateral * (corridor.maxY - corridor.minY);
    const east = uid % 2 === 0;
    const index = world.ants.spawn(
      { pos: { x, y }, heading: east ? 0 : Math.PI, colony: 0, role: AntRole.Follower, state: east ? AntState.Foraging : AntState.ReturningFood },
      uid,
      world.params.antSpeed,
      world.params,
    );
    world.ants.mass[index] = east ? world.params.mass : world.params.massCarrying;
    world.ants.velX[index] = Math.cos(east ? 0 : Math.PI) * world.params.antSpeed;
    world.ants.velY[index] = 0;
    world.ants.prevX[index] = x;
    world.ants.prevY[index] = y;
  }
  if (world.colonies[0] !== undefined) world.colonies[0].population = n;
  return world;
}

export interface LaneSample {
  x: number;
  y: number;
  // Sign of the ant's movement along the corridor: +1 east, -1 west.
  direction: 1 | -1;
}

// Share of movers in their own lane (spec §6, `lanes`). East movers count when
// they sit below the centre line, west movers when they sit above it; the
// score is the mean of the two shares. Random mixing gives about 0.5 and full
// separation gives 1.0.
export function laneScore(samples: readonly LaneSample[], centreY: number): number {
  let east = 0;
  let eastBelow = 0;
  let west = 0;
  let westAbove = 0;
  for (const sample of samples) {
    if (sample.direction > 0) {
      east += 1;
      if (sample.y > centreY) eastBelow += 1;
    } else {
      west += 1;
      if (sample.y < centreY) westAbove += 1;
    }
  }
  const eastShare = east === 0 ? 0 : eastBelow / east;
  const westShare = west === 0 ? 0 : westAbove / west;
  return (eastShare + westShare) / 2;
}

export interface CrowdMetrics {
  lanes: number;
  overlap: number;
  inCorridor: number;
}

// Snapshot metrics for a crowd world. `lanes` looks only at the middle third of
// the corridor. `overlap` is the share of non-exempt ants with a neighbour
// closer than 2 × antRadius − 0.5.
export function crowdMetrics(world: World): CrowdMetrics {
  const ants = world.ants;
  const params = world.params;
  const minX = 420;
  const maxX = 1980;
  const thirdWidth = (maxX - minX) / 3;
  const lo = minX + thirdWidth;
  const hi = maxX - thirdWidth;
  const centreY = 450;

  const samples: LaneSample[] = [];
  for (let i = 0; i < ants.size(); i++) {
    const x = ants.posX[i];
    if (x < lo || x > hi) continue;
    const vx = ants.velX[i];
    if (vx === 0) continue;
    samples.push({ x, y: ants.posY[i], direction: vx > 0 ? 1 : -1 });
  }

  const hash = new SpatialHash();
  hash.build(ants.posX, ants.posY, ants.size(), world.size, params.hashCell);
  const radius = 2 * params.antRadius - 0.5;
  let counted = 0;
  let crowded = 0;
  for (let i = 0; i < ants.size(); i++) {
    if (exemptAtNest(world, i)) continue;
    counted += 1;
    if (hash.countWithin(ants.posX[i], ants.posY[i], radius, ants.posX, ants.posY, i) > 0) crowded += 1;
  }
  return {
    lanes: laneScore(samples, centreY),
    overlap: counted === 0 ? 0 : crowded / counted,
    inCorridor: samples.length,
  };
}
