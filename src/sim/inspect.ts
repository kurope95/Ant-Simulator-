import { fromAngle, type Vec2 } from "../core/vec2.js";
import { MarkerChannel } from "./marker_grid.js";
import { isSolidAt } from "./obstacles.js";
import { antName } from "./names.js";
import { directSightTarget, explorerPattern, followerPattern } from "./sensing.js";
import { senseChannel } from "./tick.js";
import { AntRole, AntState } from "./types.js";
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

// What an ant senses this tick: the cone it looks through, each sample point
// in order with the marker score found there (0 when the point is blocked or
// the sample is skipped), and the direct-sight target if it has one. Built
// from the same patterns and channel the steering code uses.
export interface SensorView {
  fovHalfRad: number;
  radius: number;
  points: Float32Array;
  scores: Float32Array;
  count: number;
  target: Vec2 | null;
}

export function newSensorView(capacity = 25): SensorView {
  return {
    fovHalfRad: 0,
    radius: 0,
    points: new Float32Array(capacity * 2),
    scores: new Float32Array(capacity),
    count: 0,
    target: null,
  };
}

export function sensorView(world: World, uid: number, out?: SensorView): SensorView | null {
  const ants = world.ants;
  const ant = ants.indexOf(uid);
  if (ant === null) return null;
  const params = world.params;
  const state = ants.state[ant];
  const explorer = ants.role[ant] === AntRole.Explorer && state !== AntState.ReturningExhausted;
  const pattern = explorer ? explorerPattern(params) : followerPattern(params);

  const view = out ?? newSensorView(pattern.length);
  if (view.scores.length < pattern.length) {
    view.points = new Float32Array(pattern.length * 2);
    view.scores = new Float32Array(pattern.length);
  }
  view.fovHalfRad = (params.sensorHalfFovDeg * Math.PI) / 180;
  view.radius = params.sensorRadius;
  view.count = pattern.length;

  const posX = ants.posX[ant];
  const posY = ants.posY[ant];
  const heading = ants.heading[ant];
  const grid = world.markers;
  const colony = ants.colony[ant];
  const layer = colony < grid.colonies ? colony * grid.width * grid.height : -1;
  const channel = senseChannel(state);

  for (let k = 0; k < pattern.length; k++) {
    const sample = pattern[k];
    const direction = fromAngle(heading + sample.angleOffset);
    const x = posX + direction.x * sample.distance;
    const y = posY + direction.y * sample.distance;
    view.points[2 * k] = x;
    view.points[2 * k + 1] = y;
    let score = 0;
    if (
      layer >= 0 &&
      !isSolidAt(world.obstacles, { x, y }) &&
      !isSolidAt(world.obstacles, { x: (posX + x) * 0.5, y: (posY + y) * 0.5 })
    ) {
      const cell = grid.cellIndex({ x, y });
      if (cell >= 0) {
        const index = layer + cell;
        score = channel === MarkerChannel.ToHome ? grid.toHome[index] : grid.toFood[index];
      }
    }
    view.scores[k] = score;
  }
  view.target = directSightTarget(world, ant);
  return view;
}
