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
