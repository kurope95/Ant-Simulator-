import { mix32 } from "../core/rng.js";
import type { SimParams } from "../sim/params.js";
import { loadPreset } from "../sim/presets.js";
import { worldFromSetup } from "../sim/setup_apply.js";
import { stepWorld, type World } from "../sim/world.js";

const kAttractSeed = 7;
const kAttractTicks = 900;

export function makeAttractWorld(params: SimParams): World {
  const setup = loadPreset("meadow", kAttractSeed);
  if (setup === null) throw new Error("the meadow preset is missing");
  const world = worldFromSetup(setup, params);
  for (let i = 0; i < kAttractTicks; i++) stepWorld(world);
  return world;
}

export function seedFromNow(nowMs: number): number {
  return mix32(Math.floor(nowMs) >>> 0);
}
