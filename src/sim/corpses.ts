import type { Vec2 } from "../core/vec2.js";

// Dead ants lie where they fell until a forager of any colony carries them home
// as food, or until they rot away (conflict design §2). They live in their own
// list, not among the food sources, with a bucket index rebuilt once a tick so
// a battlefield full of bodies does not slow every ant's food search.
export interface Corpse {
  uid: number;
  x: number;
  y: number;
  colony: number;
  heading: number;
  value: number;
  // The tick after which it is gone.
  expires: number;
  taken: boolean;
}

const kBucket = 32;

export class Corpses {
  items: Corpse[] = [];
  nextUid = 1;
  private cols = 0;
  private rows = 0;
  private heads = new Int32Array(0);
  private next = new Int32Array(0);

  add(x: number, y: number, colony: number, heading: number, value: number, expires: number): void {
    this.items.push({ uid: this.nextUid++, x, y, colony, heading, value, expires, taken: false });
  }

  // Drops bodies that were carried off or have rotted, then reindexes the rest.
  // Runs in a serial phase, so indices stay valid through the next think phase.
  rebuild(worldSize: Vec2, tick: number): void {
    this.items = this.items.filter((corpse) => !corpse.taken && corpse.expires > tick);
    this.cols = Math.max(1, Math.ceil(worldSize.x / kBucket));
    this.rows = Math.max(1, Math.ceil(worldSize.y / kBucket));
    const cells = this.cols * this.rows;
    if (this.heads.length !== cells) this.heads = new Int32Array(cells);
    this.heads.fill(-1);
    if (this.next.length < this.items.length) this.next = new Int32Array(Math.max(16, this.items.length * 2));
    for (let i = 0; i < this.items.length; i++) {
      const cell = this.cellOf(this.items[i].x, this.items[i].y);
      this.next[i] = this.heads[cell];
      this.heads[cell] = i;
    }
  }

  // The nearest body within `radius` of (x, y) that `accept` allows, or -1.
  // Ties go to the lower index, so the answer does not depend on bucket order.
  nearest(x: number, y: number, radius: number, accept?: (corpse: Corpse) => boolean): number {
    if (this.items.length === 0 || this.heads.length === 0) return -1;
    const minCol = this.clampCol(Math.floor((x - radius) / kBucket));
    const maxCol = this.clampCol(Math.floor((x + radius) / kBucket));
    const minRow = this.clampRow(Math.floor((y - radius) / kBucket));
    const maxRow = this.clampRow(Math.floor((y + radius) / kBucket));
    const radiusSq = radius * radius;
    let best = -1;
    let bestD2 = Infinity;
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        for (let i = this.heads[row * this.cols + col]; i >= 0; i = this.next[i]) {
          const corpse = this.items[i];
          if (corpse.taken) continue;
          const dx = corpse.x - x;
          const dy = corpse.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 > radiusSq || d2 > bestD2 || (d2 === bestD2 && i > best)) continue;
          if (accept !== undefined && !accept(corpse)) continue;
          best = i;
          bestD2 = d2;
        }
      }
    }
    return best;
  }

  private cellOf(x: number, y: number): number {
    return this.clampRow(Math.floor(y / kBucket)) * this.cols + this.clampCol(Math.floor(x / kBucket));
  }

  private clampCol(col: number): number {
    return col < 0 ? 0 : col >= this.cols ? this.cols - 1 : col;
  }

  private clampRow(row: number): number {
    return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
  }
}
