import { makeColony } from "./colony.js";
import { obstacleGridFromCells } from "./obstacles.js";
import type { SimParams } from "./params.js";
import type { WorldSetup } from "./setup.js";
import { spawnAtNest } from "./tick.js";
import { makeWorld, type World } from "./world.js";

export interface WorldFromSetupOptions {
  spawnAnts?: boolean;
}

export function spawnStartingAnts(world: World, setup: WorldSetup): void {
  const count = Math.min(setup.colonies.length, world.colonies.length);
  for (let i = 0; i < count; i++) {
    const ants = Math.max(0, Math.trunc(setup.colonies[i].startingAnts));
    for (let n = 0; n < ants; n++) spawnAtNest(world, world.colonies[i]);
  }
}

// The parameters a setup starts from: the caller's params with the scenario's
// own overrides on top. "Reset parameters" goes through here too, or resetting
// would strip the overrides a scenario depends on — the maze's burn rate among
// them — and leave it unwinnable.
export function paramsForSetup(setup: WorldSetup, params: SimParams): SimParams {
  return { ...params, ...setup.paramOverrides };
}

export function worldFromSetup(
  setup: WorldSetup,
  params: SimParams,
  options: WorldFromSetupOptions = {},
): World {
  // Preset overrides beat the live params, but the world size always comes
  // from the setup itself.
  const worldParams = {
    ...paramsForSetup(setup, params),
    worldW: setup.size.x,
    worldH: setup.size.y,
  };
  const world = makeWorld(worldParams, setup.seed, setup.size);
  world.obstacles = obstacleGridFromCells(setup.obstacles);

  for (let i = 0; i < setup.colonies.length; i++) {
    const colony = setup.colonies[i];
    world.colonies.push(makeColony(i, { x: colony.nest.x, y: colony.nest.y }, colony.color));
  }
  // One marker layer per colony; the count is known only after the colonies exist.
  world.markers.resize(world.size, world.params.markerCell, Math.max(1, world.colonies.length));

  let maxUid = 0;
  for (const source of setup.food) {
    world.food.items.push({
      uid: source.uid,
      pos: { x: source.pos.x, y: source.pos.y },
      amount: source.amount,
      infinite: false,
      kind: source.kind,
    });
    maxUid = Math.max(maxUid, source.uid);
  }
  world.food.nextUid = Math.max(1, setup.nextFoodUid, maxUid + 1);

  if (options.spawnAnts !== false) spawnStartingAnts(world, setup);
  return world;
}
