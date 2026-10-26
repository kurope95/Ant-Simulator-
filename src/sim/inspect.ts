import { antName } from "./names.js";
import { AntState } from "./types.js";
import type { World } from "./world.js";

export interface AntSnapshot {
  uid: number;
  name: string;
  colony: number;
  role: 0 | 1;
  state: 0 | 1 | 2;
  x: number;
  y: number;
  heading: number;
  speed: number;
  energy: number;
  mass: number;
  carrying: boolean;
  timeSinceAnchor: number;
  degradeTimer: number;
}

// null when the uid is no longer alive (died, or the world was rebuilt).
// Looks the ant up by uid every call: indices move on swap-and-pop removal.
export function inspectAnt(world: World, uid: number): AntSnapshot | null {
  const ants = world.ants;
  const i = ants.indexOf(uid);
  if (i === null) return null;
  const state = ants.state[i];
  return {
    uid,
    name: antName(uid),
    colony: ants.colony[i],
    role: ants.role[i] as 0 | 1,
    state: state as 0 | 1 | 2,
    x: ants.posX[i],
    y: ants.posY[i],
    heading: ants.heading[i],
    speed: ants.speed[i],
    energy: ants.energy[i],
    mass: ants.mass[i],
    carrying: state === AntState.ReturningFood,
    timeSinceAnchor: ants.timeSinceAnchor[i],
    degradeTimer: ants.degradeTimer[i],
  };
}
