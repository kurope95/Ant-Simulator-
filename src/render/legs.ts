import { mix32 } from "../core/rng.js";
import type { World } from "../sim/world.js";

export const kGaitStride = 24;

const kUnit = 4294967296;
const kTwoPi = Math.PI * 2;

/** Render-only walking phase per ant, advanced by distance travelled. */
export class GaitTracker {
  private uids = new Uint32Array(0);
  private lastX = new Float32Array(0);
  private lastY = new Float32Array(0);
  private phases = new Float32Array(0);
  private count = 0;

  update(world: World): void {
    const ants = world.ants;
    const size = ants.size();
    if (size > this.uids.length) this.grow(size);
    for (let i = 0; i < size; i++) {
      const uid = ants.uid[i];
      if (i >= this.count || this.uids[i] !== uid) {
        this.uids[i] = uid;
        this.lastX[i] = ants.posX[i];
        this.lastY[i] = ants.posY[i];
        this.phases[i] = mix32(uid) / kUnit;
        continue;
      }
      const dx = ants.posX[i] - this.lastX[i];
      const dy = ants.posY[i] - this.lastY[i];
      this.lastX[i] = ants.posX[i];
      this.lastY[i] = ants.posY[i];
      this.phases[i] = (this.phases[i] + Math.hypot(dx, dy) / kGaitStride) % 1;
    }
    this.count = size;
  }

  phaseAt(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) return 0;
    return this.phases[index];
  }

  private grow(size: number): void {
    let capacity = Math.max(64, this.uids.length * 2);
    while (capacity < size) capacity *= 2;
    const uids = new Uint32Array(capacity);
    uids.set(this.uids);
    this.uids = uids;
    const lastX = new Float32Array(capacity);
    lastX.set(this.lastX);
    this.lastX = lastX;
    const lastY = new Float32Array(capacity);
    lastY.set(this.lastY);
    this.lastY = lastY;
    const phases = new Float32Array(capacity);
    phases.set(this.phases);
    this.phases = phases;
  }
}

export interface LegPose {
  hipX: number;
  hipY: number;
  footX: number;
  footY: number;
  kneeX: number;
  kneeY: number;
  lift: number;
}

const kRestX = [0.34, 0.02, -0.28];
const kHipX = [0.16, 0.02, -0.14];

/** Body-local pose of one leg: +x forward, +y to the ant's right. */
export function legPose(phase: number, leg: number, lengthPx: number): LegPose {
  const side = leg < 3 ? -1 : 1;
  const which = leg % 3;
  const tripodA = leg === 0 || leg === 2 || leg === 4;
  const wave = Math.sin(kTwoPi * phase + (tripodA ? 0 : Math.PI));
  const lift = Math.max(0, wave);
  const restX = kRestX[which] * lengthPx;
  const hipX = kHipX[which] * lengthPx;
  const hipY = side * 0.1 * lengthPx;
  const restY = side * 0.36 * lengthPx;
  const footX = restX + 0.22 * lengthPx * wave;
  const footY = restY + side * 0.06 * lengthPx * lift;
  const kneeX = (hipX + footX) / 2 - 0.04 * lengthPx;
  const kneeY = (hipY + footY) / 2 + side * 0.12 * lengthPx;
  return { hipX, hipY, footX, footY, kneeX, kneeY, lift };
}
