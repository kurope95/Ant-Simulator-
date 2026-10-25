import { nestRadius } from "./colony.js";
import { foodRadius } from "./food.js";
import type { SimParams } from "./params.js";
import type { World } from "./world.js";

export interface StuckState {
  stuck: boolean;
  degrade: boolean;
}

export function evaluateStuck(
  timeSinceLastMarker: number,
  inZone: boolean,
  nearby: number,
  params: SimParams,
): StuckState {
  const stuck = timeSinceLastMarker > params.stuckTimeout;
  // A traffic jam at the nest or a food pile is not a dead end, so a crowd
  // there must never erase the trail it is using (spec §5.5).
  return { stuck, degrade: stuck && !inZone && nearby < params.crowdLimit };
}

export function inRestZone(world: World, ant: number): boolean {
  const ants = world.ants;
  const params = world.params;
  const x = ants.posX[ant];
  const y = ants.posY[ant];
  const colony = world.colonies[ants.colony[ant]];
  if (colony !== undefined) {
    const reach = nestRadius(colony, params) + params.zoneMargin;
    const dx = x - colony.nest.x;
    const dy = y - colony.nest.y;
    if (dx * dx + dy * dy <= reach * reach) return true;
  }
  for (const source of world.food.items) {
    const reach = foodRadius(source, params) + params.zoneMargin;
    const dx = x - source.pos.x;
    const dy = y - source.pos.y;
    if (dx * dx + dy * dy <= reach * reach) return true;
  }
  return false;
}
