import { mix32 } from "../core/rng.js";
import type { Ants } from "./ants.js";
import { nestRadius } from "./colony.js";
import { nearestFreePoint } from "./obstacles.js";
import { ObstacleKind } from "./setup.js";
import type { World } from "./world.js";

function solid(kind: number): boolean {
  return kind === ObstacleKind.Rock || kind === ObstacleKind.Water;
}

// Per-pass buffers for the Jacobi ant-to-ant pass. Owned by the world and
// grown with the ant capacity, so a tick allocates nothing.
export interface CollisionScratch {
  corrX: Float32Array;
  corrY: Float32Array;
  count: Uint16Array;
  // 1 for an ant inside its nest exemption, worked out once per pass.
  exempt: Uint8Array;
  nb: Uint32Array;
}

const kNeighbourBuffer = 64;

export function makeCollisionScratch(): CollisionScratch {
  return {
    corrX: new Float32Array(0),
    corrY: new Float32Array(0),
    count: new Uint16Array(0),
    exempt: new Uint8Array(0),
    nb: new Uint32Array(kNeighbourBuffer),
  };
}

// True for an ant inside its own nest radius: its colony's ants pile up at the
// entrance and must still reach the nest, so they neither push nor get pushed.
export function exemptAtNest(world: World, index: number): boolean {
  const ants = world.ants;
  const colony = world.colonies[ants.colony[index]];
  if (colony === undefined) return false;
  const reach = nestRadius(colony, world.params) * world.params.nestExemptFactor;
  const dx = ants.posX[index] - colony.nest.x;
  const dy = ants.posY[index] - colony.nest.y;
  return dx * dx + dy * dy <= reach * reach;
}

// Pushes overlapping ants apart (spec §6.2). Jacobi: every correction is
// computed from the same positions, then all are applied together, so the
// result does not depend on ant order. Carriers (heavier) move less.
export function resolveAntOverlaps(world: World, scratch: CollisionScratch): void {
  const ants = world.ants;
  const params = world.params;
  const n = ants.size();
  if (scratch.corrX.length < n) {
    scratch.corrX = new Float32Array(ants.posX.length);
    scratch.corrY = new Float32Array(ants.posX.length);
    scratch.count = new Uint16Array(ants.posX.length);
    scratch.exempt = new Uint8Array(ants.posX.length);
  }
  const { corrX, corrY, count, exempt, nb } = scratch;
  const hash = world.spatialHash;
  const posX = ants.posX;
  const posY = ants.posY;
  const d = 2 * params.antRadius;
  const dSq = d * d;

  for (let i = 0; i < n; i++) exempt[i] = exemptAtNest(world, i) ? 1 : 0;
  for (let i = 0; i < n; i++) {
    corrX[i] = 0;
    corrY[i] = 0;
    count[i] = 0;
    if (exempt[i] === 1) continue;
    // +1 u: positions shift between iterations, so look a little wider than contact.
    const found = hash.queryWithin(posX[i], posY[i], d + 1, posX, posY, i, nb);
    for (let k = 0; k < found; k++) {
      const j = nb[k];
      if (exempt[j] === 1) continue;
      const dx = posX[i] - posX[j];
      const dy = posY[i] - posY[j];
      const distSq = dx * dx + dy * dy;
      if (distSq >= dSq) continue;
      let nx: number;
      let ny: number;
      let overlap: number;
      if (distSq < 1e-8) {
        // Coincident: a fixed direction per pair, antisymmetric between the two ants.
        const lo = Math.min(ants.uid[i], ants.uid[j]);
        const hi = Math.max(ants.uid[i], ants.uid[j]);
        const a = (mix32((Math.imul(lo, 0x9e3779b1) ^ hi) >>> 0) / 4294967296) * Math.PI * 2;
        const s = ants.uid[i] === lo ? 1 : -1;
        nx = Math.cos(a) * s;
        ny = Math.sin(a) * s;
        overlap = d;
      } else {
        const dist = Math.sqrt(distSq);
        nx = dx / dist;
        ny = dy / dist;
        overlap = d - dist;
      }
      const wi = 1 / ants.mass[i];
      const wj = 1 / ants.mass[j];
      const share = wi / (wi + wj);
      corrX[i] += nx * overlap * share;
      corrY[i] += ny * overlap * share;
      count[i] += 1;
    }
  }
  for (let i = 0; i < n; i++) {
    if (count[i] === 0) continue;
    posX[i] += corrX[i] / count[i];
    posY[i] += corrY[i] / count[i];
  }
}

// Keeps a heading from pointing into a wall: only the tangent part survives.
// Almost head-on headings become tangent to one deterministic side instead,
// so an ant that walks straight into a rock keeps moving along it.
export function slideHeadingAlongNormal(
  ants: Ants,
  index: number,
  nx: number,
  ny: number,
): void {
  const heading = ants.heading[index];
  const hx = Math.cos(heading);
  const hy = Math.sin(heading);
  const into = hx * nx + hy * ny;
  if (into >= 0) return;
  let tx = hx - into * nx;
  let ty = hy - into * ny;
  if (tx * tx + ty * ty < 0.04) {
    const side = (ants.uid[index] & 1) === 0 ? 1 : -1;
    tx = -ny * side;
    ty = nx * side;
  }
  ants.heading[index] = Math.atan2(ty, tx);
}

export function resolveObstacles(world: World): void {
  const ants = world.ants;
  const grid = world.obstacles;
  const cell = grid.cell;
  const radius = world.params.antRadius;
  const radiusSq = radius * radius;

  // An ant whose centre sits in the interior of a solid blob is never touched
  // by the border-only push below. Move it to the closest open cell; if the
  // blob is larger than the search, it has nowhere legal to go and is left to
  // die rather than teleported across the map.
  for (let index = 0; index < ants.size(); index++) {
    const col = Math.floor(ants.posX[index] / cell);
    const row = Math.floor(ants.posY[index] / cell);
    if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) continue;
    const own = row * grid.width + col;
    if (!solid(grid.kind[own]) || grid.border[own] === 1) continue;
    const free = nearestFreePoint(grid, { x: ants.posX[index], y: ants.posY[index] }, 16);
    if (free === null) {
      ants.energy[index] = 0;
    } else {
      ants.posX[index] = free.x;
      ants.posY[index] = free.y;
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let index = 0; index < ants.size(); index++) {
      const col0 = Math.floor(ants.posX[index] / cell);
      const row0 = Math.floor(ants.posY[index] / cell);
      const inside = col0 >= 0 && row0 >= 0 && col0 < grid.width && row0 < grid.height;
      if (inside && grid.nearSolid[row0 * grid.width + col0] === 0) continue;

      for (let row = row0 - 1; row <= row0 + 1; row++) {
        if (row < 0 || row >= grid.height) continue;
        for (let col = col0 - 1; col <= col0 + 1; col++) {
          if (col < 0 || col >= grid.width) continue;
          const cellIndex = row * grid.width + col;
          if (grid.border[cellIndex] !== 1 || !solid(grid.kind[cellIndex])) continue;

          const minX = col * cell;
          const minY = row * cell;
          const maxX = minX + cell;
          const maxY = minY + cell;
          const nearestX = Math.min(maxX, Math.max(minX, ants.posX[index]));
          const nearestY = Math.min(maxY, Math.max(minY, ants.posY[index]));
          const dx = ants.posX[index] - nearestX;
          const dy = ants.posY[index] - nearestY;
          const distSq = dx * dx + dy * dy;
          if (distSq >= radiusSq) continue;

          if (distSq > 0) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            const push = (radius - dist) / dist;
            ants.posX[index] += dx * push;
            ants.posY[index] += dy * push;
            slideHeadingAlongNormal(ants, index, nx, ny);
            continue;
          }

          const left = ants.posX[index] - minX;
          const right = maxX - ants.posX[index];
          const up = ants.posY[index] - minY;
          const down = maxY - ants.posY[index];
          const nearest = Math.min(left, right, up, down);
          if (nearest === left) {
            ants.posX[index] = minX - radius;
            slideHeadingAlongNormal(ants, index, -1, 0);
          } else if (nearest === right) {
            ants.posX[index] = maxX + radius;
            slideHeadingAlongNormal(ants, index, 1, 0);
          } else if (nearest === up) {
            ants.posY[index] = minY - radius;
            slideHeadingAlongNormal(ants, index, 0, -1);
          } else {
            ants.posY[index] = maxY + radius;
            slideHeadingAlongNormal(ants, index, 0, 1);
          }
        }
      }
    }
  }
}
