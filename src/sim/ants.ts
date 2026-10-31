import { f32, i32, sameKind, u32, u8 } from "../core/shared.js";
import type { Vec2 } from "../core/vec2.js";
import type { SimParams } from "./params.js";
import { AntRole, AntState } from "./types.js";

export interface AntSpawn {
  pos: Vec2;
  heading?: number;
  colony?: number;
  role?: AntRole;
  state?: AntState;
  // Seconds the ant has left to live; Infinity when the life cycle is off.
  lifeLeft?: number;
}

export class Ants {
  uid: Uint32Array;
  colony: Uint8Array;
  role: Uint8Array;
  state: Uint8Array;
  posX: Float32Array;
  posY: Float32Array;
  prevX: Float32Array;
  prevY: Float32Array;
  velX: Float32Array;
  velY: Float32Array;
  heading: Float32Array;
  speed: Float32Array;
  mass: Float32Array;
  energy: Float32Array;
  timeSinceAnchor: Float32Array;
  dropX: Float32Array;
  dropY: Float32Array;
  timeSinceLastMarker: Float32Array;
  degradeTimer: Float32Array;
  lastMarkerCell: Int32Array;
  wanderOffset: Float32Array;
  wanderHeading: Float32Array;
  wanderTimer: Float32Array;
  homeErrX: Float32Array;
  homeErrY: Float32Array;
  avoidX: Float32Array;
  avoidY: Float32Array;
  lifeLeft: Float32Array;
  // 1 while carrying from a pile that still had plenty left: worth calling others out for (spec §5.8).
  richFind: Uint8Array;
  // Seconds spent crowded near a food pile without reaching it (spec §5.4).
  foodWait: Float32Array;

  private count = 0;
  private capacity: number;
  private readonly indexByUid = new Map<number, number>();

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.uid = u32(capacity);
    this.colony = u8(capacity);
    this.role = u8(capacity);
    this.state = u8(capacity);
    this.posX = f32(capacity);
    this.posY = f32(capacity);
    this.prevX = f32(capacity);
    this.prevY = f32(capacity);
    this.velX = f32(capacity);
    this.velY = f32(capacity);
    this.heading = f32(capacity);
    this.speed = f32(capacity);
    this.mass = f32(capacity);
    this.energy = f32(capacity);
    this.timeSinceAnchor = f32(capacity);
    this.dropX = f32(capacity);
    this.dropY = f32(capacity);
    this.timeSinceLastMarker = f32(capacity);
    this.degradeTimer = f32(capacity);
    this.lastMarkerCell = i32(capacity);
    this.wanderOffset = f32(capacity);
    this.wanderHeading = f32(capacity);
    this.wanderTimer = f32(capacity);
    this.homeErrX = f32(capacity);
    this.homeErrY = f32(capacity);
    this.avoidX = f32(capacity);
    this.avoidY = f32(capacity);
    this.lifeLeft = f32(capacity);
    this.richFind = u8(capacity);
    this.foodWait = f32(capacity);
  }

  size(): number {
    return this.count;
  }

  spawn(a: AntSpawn, uid: number, speed: number, params: SimParams): number {
    this.ensureCapacity();
    const i = this.count;
    this.uid[i] = uid;
    this.colony[i] = a.colony ?? 0;
    this.role[i] = a.role ?? AntRole.Follower;
    this.state[i] = a.state ?? AntState.Foraging;
    this.posX[i] = a.pos.x;
    this.posY[i] = a.pos.y;
    this.prevX[i] = a.pos.x;
    this.prevY[i] = a.pos.y;
    this.velX[i] = 0;
    this.velY[i] = 0;
    this.heading[i] = a.heading ?? 0;
    this.speed[i] = speed;
    this.mass[i] = params.mass;
    this.energy[i] = params.energyMax;
    this.timeSinceAnchor[i] = 0;
    this.dropX[i] = a.pos.x;
    this.dropY[i] = a.pos.y;
    this.timeSinceLastMarker[i] = 0;
    this.degradeTimer[i] = 0;
    this.lastMarkerCell[i] = -1;
    this.wanderOffset[i] = 0;
    this.wanderHeading[i] = a.heading ?? 0;
    this.wanderTimer[i] = 0;
    this.homeErrX[i] = 0;
    this.homeErrY[i] = 0;
    this.avoidX[i] = 0;
    this.avoidY[i] = 0;
    this.lifeLeft[i] = a.lifeLeft ?? Infinity;
    this.richFind[i] = 0;
    this.foodWait[i] = 0;
    this.indexByUid.set(uid, i);
    this.count += 1;
    return i;
  }

  removeSwap(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new RangeError(`ant index ${index} outside 0..${this.count - 1}`);
    }
    const removedUid = this.uid[index];
    const last = this.count - 1;
    if (index !== last) {
      this.uid[index] = this.uid[last];
      this.colony[index] = this.colony[last];
      this.role[index] = this.role[last];
      this.state[index] = this.state[last];
      this.posX[index] = this.posX[last];
      this.posY[index] = this.posY[last];
      this.prevX[index] = this.prevX[last];
      this.prevY[index] = this.prevY[last];
      this.velX[index] = this.velX[last];
      this.velY[index] = this.velY[last];
      this.heading[index] = this.heading[last];
      this.speed[index] = this.speed[last];
      this.mass[index] = this.mass[last];
      this.energy[index] = this.energy[last];
      this.timeSinceAnchor[index] = this.timeSinceAnchor[last];
      this.dropX[index] = this.dropX[last];
      this.dropY[index] = this.dropY[last];
      this.timeSinceLastMarker[index] = this.timeSinceLastMarker[last];
      this.degradeTimer[index] = this.degradeTimer[last];
      this.lastMarkerCell[index] = this.lastMarkerCell[last];
      this.wanderOffset[index] = this.wanderOffset[last];
      this.wanderHeading[index] = this.wanderHeading[last];
      this.wanderTimer[index] = this.wanderTimer[last];
      this.homeErrX[index] = this.homeErrX[last];
      this.homeErrY[index] = this.homeErrY[last];
      this.avoidX[index] = this.avoidX[last];
      this.avoidY[index] = this.avoidY[last];
      this.lifeLeft[index] = this.lifeLeft[last];
      this.richFind[index] = this.richFind[last];
      this.foodWait[index] = this.foodWait[last];
      this.indexByUid.set(this.uid[index], index);
    }
    this.indexByUid.delete(removedUid);
    this.count = last;
  }

  indexOf(uid: number): number | null {
    const index = this.indexByUid.get(uid);
    return index === undefined ? null : index;
  }

  private ensureCapacity(): void {
    if (this.count < this.capacity) return;
    const next = this.capacity * 2;
    this.uid = grow(this.uid, next);
    this.colony = grow(this.colony, next);
    this.role = grow(this.role, next);
    this.state = grow(this.state, next);
    this.posX = grow(this.posX, next);
    this.posY = grow(this.posY, next);
    this.prevX = grow(this.prevX, next);
    this.prevY = grow(this.prevY, next);
    this.velX = grow(this.velX, next);
    this.velY = grow(this.velY, next);
    this.heading = grow(this.heading, next);
    this.speed = grow(this.speed, next);
    this.mass = grow(this.mass, next);
    this.energy = grow(this.energy, next);
    this.timeSinceAnchor = grow(this.timeSinceAnchor, next);
    this.dropX = grow(this.dropX, next);
    this.dropY = grow(this.dropY, next);
    this.timeSinceLastMarker = grow(this.timeSinceLastMarker, next);
    this.degradeTimer = grow(this.degradeTimer, next);
    this.lastMarkerCell = grow(this.lastMarkerCell, next);
    this.wanderOffset = grow(this.wanderOffset, next);
    this.wanderHeading = grow(this.wanderHeading, next);
    this.wanderTimer = grow(this.wanderTimer, next);
    this.homeErrX = grow(this.homeErrX, next);
    this.homeErrY = grow(this.homeErrY, next);
    this.avoidX = grow(this.avoidX, next);
    this.avoidY = grow(this.avoidY, next);
    this.lifeLeft = grow(this.lifeLeft, next);
    this.richFind = grow(this.richFind, next);
    this.foodWait = grow(this.foodWait, next);
    this.capacity = next;
  }
}

type GrowableArray =
  | Uint32Array
  | Uint8Array
  | Int32Array
  | Float32Array;

function grow<T extends GrowableArray>(array: T, capacity: number): T {
  const next = sameKind(array, capacity);
  next.set(array);
  return next;
}
