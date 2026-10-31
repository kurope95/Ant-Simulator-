import { exemptAtNest } from "./collide.js";
import type { World } from "./world.js";

// Scratch for the neighbour search, sized for the largest allowed maxNeighbours.
export interface AvoidScratch {
  idx: Uint32Array;
  d2: Float32Array;
}

const kMaxNeighbourScratch = 64;

export function makeAvoidScratch(): AvoidScratch {
  return {
    idx: new Uint32Array(kMaxNeighbourScratch),
    d2: new Float32Array(kMaxNeighbourScratch),
  };
}

// Pure helper: the earliest t > 0 at which two circles touch, or null.
export function timeToCollision(
  dpx: number,
  dpy: number,
  dvx: number,
  dvy: number,
  radiusSum: number,
): number | null {
  const a = dvx * dvx + dvy * dvy;
  const b = 2 * (dpx * dvx + dpy * dvy);
  const c = dpx * dpx + dpy * dpy - radiusSum * radiusSum;
  if (c < 0 || a < 1e-6) return null; // already touching (PBD's job) or no relative motion
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 ? t : null;
}

// Spec §6.1, with the sidestep rule from the M4 plan. Only ants whose (uid +
// tick) is even are recomputed on this tick; the others keep last tick's value.
// Reads start-of-tick positions and last tick's velocities, and writes only
// the ant's own avoidX/avoidY, so the result does not depend on ant order.
export function computeAvoidance(world: World, scratch: AvoidScratch): void {
  const ants = world.ants;
  const params = world.params;
  const n = ants.size();
  const hash = world.spatialHash;
  const { posX, posY, velX, velY, heading, speed, mass, uid } = ants;
  for (let i = 0; i < n; i++) {
    if (((uid[i] + world.tick) & 1) !== 0) continue;
    let ax = 0;
    let ay = 0;
    if (params.antCollisions && !exemptAtNest(world, i)) {
      const sp = speed[i];
      const fx = Math.cos(heading[i]);
      const fy = Math.sin(heading[i]);
      const R = Math.min(2 * sp * params.tHorizon, params.rAvoidMax);
      const k = hash.nearestWithin(
        posX[i],
        posY[i],
        R,
        posX,
        posY,
        i,
        params.maxNeighbours,
        scratch.idx,
        scratch.d2,
      );
      const rightBias = params.sidestepRightBias;
      let oncoming = 0;
      for (let m = 0; m < k; m++) {
        const j = scratch.idx[m];
        const dpx = posX[j] - posX[i];
        const dpy = posY[j] - posY[i];
        if (dpx * fx + dpy * fy <= 0) continue; // only ants in front
        if (velX[j] * fx + velY[j] * fy < 0) oncoming += 1; // for lane keeping
        const dvx = velX[j] - velX[i];
        const dvy = velY[j] - velY[i];
        const t = timeToCollision(dpx, dpy, dvx, dvy, 2 * params.antRadius);
        if (t === null || t >= params.tHorizon) continue;
        // At contact, i sits at (pi + vi t) and j at (pj + vj t). Step sideways
        // away from j, across the relative motion.
        let lx = -(dpx + dvx * t);
        let ly = -(dpy + dvy * t); // from j to i at contact
        const rl = Math.hypot(dvx, dvy);
        const ux = dvx / rl;
        const uy = dvy / rl;
        const along = lx * ux + ly * uy;
        lx -= along * ux;
        ly -= along * uy; // keep only the lateral part
        let ll = Math.hypot(lx, ly);
        if (ll < 1e-3) {
          // Exactly head-on: sidestep to own right (y-down screen).
          lx = -fy;
          ly = fx;
          ll = 1;
        }
        // Lean the sidestep toward the own right. For two ants walking at each
        // other the away directions are opposite and so are their rights, so
        // the pushes stay mirror images: both agree on who passes where, and
        // near head-on that is always right-hand traffic.
        let sx = lx / ll - fy * rightBias;
        let sy = ly / ll + fx * rightBias;
        const sl = Math.hypot(sx, sy);
        if (sl < 1e-3) {
          sx = -fy;
          sy = fx;
        } else {
          sx /= sl;
          sy /= sl;
        }
        const urgency = 1 - t / params.tHorizon;
        const weight = mass[j] / (mass[i] + mass[j]); // unloaded ants give way to carriers
        ax += sx * sp * urgency * weight;
        ay += sy * sp * urgency * weight;
      }
      const cap = params.avoidMaxSpeedFactor * sp;
      if (oncoming > 0 && params.laneKeep > 0) {
        // Lane keeping: with oncoming traffic ahead, a steady drift to the own
        // right sorts the streams into lanes (and presses them closer together).
        ax += -fy * params.laneKeep * cap;
        ay += fx * params.laneKeep * cap;
      }
      const len = Math.hypot(ax, ay);
      if (len > cap) {
        ax *= cap / len;
        ay *= cap / len;
      }
    }
    ants.avoidX[i] = ax;
    ants.avoidY[i] = ay;
  }
}
