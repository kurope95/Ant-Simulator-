import type { Vec2 } from "../core/vec2.js";

// Counting-sort bucket grid over ant positions. Rebuilt once per tick; it
// answers neighbour counts, and M4 will reuse it for avoidance queries.
// Only occupied cells are indexed, so a build costs O(ants) rather than
// O(world cells) — a 1920x1080 world has 57,600 cells at a 6 u hash.
export class SpatialHash {
  cell = 1;
  cols = 0;
  rows = 0;
  cellStart = new Uint32Array(0);
  cellEnd = new Uint32Array(0);
  items = new Uint32Array(0);
  private slotByCell = new Int32Array(0);
  private activeCells = new Uint32Array(0);
  private lastCells = new Uint32Array(0);
  private counts = new Uint32Array(0);
  private lastCount = 0;

  build(xs: Float32Array, ys: Float32Array, count: number, worldSize: Vec2, cell: number): void {
    this.cell = cell > 0 ? cell : 1;
    this.cols = Math.max(1, Math.ceil(worldSize.x / this.cell));
    this.rows = Math.max(1, Math.ceil(worldSize.y / this.cell));
    const cells = this.cols * this.rows;
    if (this.cellStart.length !== cells) {
      this.cellStart = new Uint32Array(cells);
      this.cellEnd = new Uint32Array(cells);
      this.slotByCell = new Int32Array(cells);
      this.slotByCell.fill(-1);
      this.lastCount = 0;
    } else {
      for (let k = 0; k < this.lastCount; k++) {
        const c = this.lastCells[k];
        this.slotByCell[c] = -1;
        this.cellStart[c] = 0;
        this.cellEnd[c] = 0;
      }
    }
    this.lastCount = 0;
    if (this.items.length < count) this.items = new Uint32Array(count);
    if (this.activeCells.length < count) {
      this.activeCells = new Uint32Array(count);
      this.lastCells = new Uint32Array(count);
      this.counts = new Uint32Array(count);
    }

    let active = 0;
    for (let i = 0; i < count; i++) {
      const c = this.cellIndex(xs[i], ys[i]);
      let slot = this.slotByCell[c];
      if (slot < 0) {
        slot = active;
        this.slotByCell[c] = slot;
        this.activeCells[active] = c;
        active += 1;
        this.counts[slot] = 0;
      }
      this.counts[slot] += 1;
    }
    let running = 0;
    for (let k = 0; k < active; k++) {
      const c = this.activeCells[k];
      this.cellStart[c] = running;
      running += this.counts[k];
      this.cellEnd[c] = running;
      this.counts[k] = this.cellStart[c];
    }
    for (let i = 0; i < count; i++) {
      const c = this.cellIndex(xs[i], ys[i]);
      const slot = this.slotByCell[c];
      this.items[this.counts[slot]] = i;
      this.counts[slot] += 1;
    }

    const swap = this.lastCells;
    this.lastCells = this.activeCells;
    this.activeCells = swap;
    this.lastCount = active;
  }

  countWithin(
    x: number,
    y: number,
    radius: number,
    xs: Float32Array,
    ys: Float32Array,
    exclude: number,
  ): number {
    if (!(radius >= 0)) return 0;
    const minCol = this.clampCol(Math.floor((x - radius) / this.cell));
    const maxCol = this.clampCol(Math.floor((x + radius) / this.cell));
    const minRow = this.clampRow(Math.floor((y - radius) / this.cell));
    const maxRow = this.clampRow(Math.floor((y + radius) / this.cell));
    const radiusSq = radius * radius;
    let found = 0;
    for (let row = minRow; row <= maxRow; row++) {
      const base = row * this.cols;
      for (let col = minCol; col <= maxCol; col++) {
        const c = base + col;
        const end = this.cellEnd[c];
        for (let k = this.cellStart[c]; k < end; k++) {
          const i = this.items[k];
          if (i === exclude) continue;
          const dx = xs[i] - x;
          const dy = ys[i] - y;
          if (dx * dx + dy * dy <= radiusSq) found += 1;
        }
      }
    }
    return found;
  }

  // Counts the ants within `radius` of (x, y), except `exclude`, whose
  // group[i] equals `own` and those whose group differs, and finds the nearest
  // of the latter (ties: lower index). Writes [same, other, nearest or -1] to out.
  countGroups(
    x: number,
    y: number,
    radius: number,
    xs: Float32Array,
    ys: Float32Array,
    exclude: number,
    group: Uint8Array,
    own: number,
    out: Int32Array,
  ): void {
    let same = 0;
    let other = 0;
    let nearest = -1;
    let nearestD2 = Infinity;
    if (radius >= 0) {
      const minCol = this.clampCol(Math.floor((x - radius) / this.cell));
      const maxCol = this.clampCol(Math.floor((x + radius) / this.cell));
      const minRow = this.clampRow(Math.floor((y - radius) / this.cell));
      const maxRow = this.clampRow(Math.floor((y + radius) / this.cell));
      const radiusSq = radius * radius;
      for (let row = minRow; row <= maxRow; row++) {
        const base = row * this.cols;
        for (let col = minCol; col <= maxCol; col++) {
          const c = base + col;
          const end = this.cellEnd[c];
          for (let k = this.cellStart[c]; k < end; k++) {
            const i = this.items[k];
            if (i === exclude) continue;
            const dx = xs[i] - x;
            const dy = ys[i] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 > radiusSq) continue;
            if (group[i] === own) {
              same += 1;
            } else {
              other += 1;
              if (d2 < nearestD2 || (d2 === nearestD2 && i < nearest)) {
                nearestD2 = d2;
                nearest = i;
              }
            }
          }
        }
      }
    }
    out[0] = same;
    out[1] = other;
    out[2] = nearest;
  }

  // Writes the indices of every ant within `radius` of (x, y), except `exclude`,
  // into `out`. Returns how many were written (at most out.length).
  queryWithin(
    x: number,
    y: number,
    radius: number,
    xs: Float32Array,
    ys: Float32Array,
    exclude: number,
    out: Uint32Array,
  ): number {
    if (!(radius >= 0)) return 0;
    const minCol = this.clampCol(Math.floor((x - radius) / this.cell));
    const maxCol = this.clampCol(Math.floor((x + radius) / this.cell));
    const minRow = this.clampRow(Math.floor((y - radius) / this.cell));
    const maxRow = this.clampRow(Math.floor((y + radius) / this.cell));
    const radiusSq = radius * radius;
    const capacity = out.length;
    let found = 0;
    for (let row = minRow; row <= maxRow; row++) {
      const base = row * this.cols;
      for (let col = minCol; col <= maxCol; col++) {
        const c = base + col;
        const end = this.cellEnd[c];
        for (let k = this.cellStart[c]; k < end && found < capacity; k++) {
          const i = this.items[k];
          if (i === exclude) continue;
          const dx = xs[i] - x;
          const dy = ys[i] - y;
          if (dx * dx + dy * dy <= radiusSq) {
            out[found] = i;
            found += 1;
          }
        }
      }
    }
    return found;
  }

  // Like queryWithin, but keeps only the `k` nearest, sorted by distance (ties
  // broken by the lower index). Squared distances go into outDistSq.
  // Returns the count kept (at most k).
  nearestWithin(
    x: number,
    y: number,
    radius: number,
    xs: Float32Array,
    ys: Float32Array,
    exclude: number,
    k: number,
    outIdx: Uint32Array,
    outDistSq: Float32Array,
  ): number {
    if (!(radius >= 0) || !(k > 0)) return 0;
    const limit = Math.min(k, outIdx.length, outDistSq.length);
    if (limit === 0) return 0;
    const minCol = this.clampCol(Math.floor((x - radius) / this.cell));
    const maxCol = this.clampCol(Math.floor((x + radius) / this.cell));
    const minRow = this.clampRow(Math.floor((y - radius) / this.cell));
    const maxRow = this.clampRow(Math.floor((y + radius) / this.cell));
    const radiusSq = radius * radius;
    let kept = 0;
    for (let row = minRow; row <= maxRow; row++) {
      const base = row * this.cols;
      for (let col = minCol; col <= maxCol; col++) {
        const c = base + col;
        const end = this.cellEnd[c];
        for (let slot = this.cellStart[c]; slot < end; slot++) {
          const i = this.items[slot];
          if (i === exclude) continue;
          const dx = xs[i] - x;
          const dy = ys[i] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 > radiusSq) continue;
          if (kept === limit) {
            // Full: only a candidate that sorts before the current worst gets in.
            const worst = limit - 1;
            if (d2 > outDistSq[worst] || (d2 === outDistSq[worst] && i > outIdx[worst])) continue;
          } else {
            kept += 1;
          }
          // Insertion sort into place, dropping the old worst when full.
          let pos = kept - 1;
          while (pos > 0 && (outDistSq[pos - 1] > d2 || (outDistSq[pos - 1] === d2 && outIdx[pos - 1] > i))) {
            outDistSq[pos] = outDistSq[pos - 1];
            outIdx[pos] = outIdx[pos - 1];
            pos -= 1;
          }
          outDistSq[pos] = d2;
          outIdx[pos] = i;
        }
      }
    }
    return kept;
  }

  private cellIndex(x: number, y: number): number {
    return this.clampRow(Math.floor(y / this.cell)) * this.cols + this.clampCol(Math.floor(x / this.cell));
  }

  private clampCol(col: number): number {
    return col < 0 ? 0 : col >= this.cols ? this.cols - 1 : col;
  }

  private clampRow(row: number): number {
    return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
  }
}
