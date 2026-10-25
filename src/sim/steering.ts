import { angleDiff, clamp, wrapAngle } from "../core/math.js";
import { randRange } from "../core/rng.js";
import { AntRole, RandStream } from "./types.js";
import type { World } from "./world.js";

export function turnToward(heading: number, target: number, maxTurn: number): number {
  return heading + clamp(angleDiff(heading, target), -maxTurn, maxTurn);
}

export function updateWander(world: World, ant: number, dt: number): boolean {
  const ants = world.ants;
  ants.wanderTimer[ant] -= dt;
  if (ants.wanderTimer[ant] > 0) return false;
  const explorer = ants.role[ant] === AntRole.Explorer;
  const params = world.params;
  const angle = explorer ? params.wanderAngleExplorer : params.wanderAngleFollower;
  const interval = explorer ? params.wanderIntervalExplorer : params.wanderIntervalFollower;
  const uid = ants.uid[ant];
  const offset = randRange(world.seed, uid, world.tick, RandStream.WanderOffset, -angle, angle);
  ants.wanderOffset[ant] = offset;
  // The target heading is absolute so it persists between picks without becoming
  // a constant turn toward `heading + offset` (spec §5.4).
  ants.wanderHeading[ant] = wrapAngle(ants.heading[ant] + offset);
  ants.wanderTimer[ant] =
    interval * randRange(world.seed, uid, world.tick, RandStream.WanderInterval, 0.5, 1.5);
  return true;
}
