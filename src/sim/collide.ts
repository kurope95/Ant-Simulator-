import { ObstacleKind } from "./setup.js";
import type { World } from "./world.js";

function solid(kind: number): boolean {
  return kind === ObstacleKind.Rock || kind === ObstacleKind.Water;
}

export function resolveObstacles(world: World): void {
  const ants = world.ants;
  const grid = world.obstacles;
  const cell = grid.cell;
  const radius = world.params.antRadius;
  const radiusSq = radius * radius;

  for (let pass = 0; pass < 2; pass++) {
    for (let index = 0; index < ants.size(); index++) {
      const col0 = Math.floor(ants.posX[index] / cell);
      const row0 = Math.floor(ants.posY[index] / cell);

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
            const push = (radius - dist) / dist;
            ants.posX[index] += dx * push;
            ants.posY[index] += dy * push;
            continue;
          }

          const left = ants.posX[index] - minX;
          const right = maxX - ants.posX[index];
          const up = ants.posY[index] - minY;
          const down = maxY - ants.posY[index];
          const nearest = Math.min(left, right, up, down);
          if (nearest === left) ants.posX[index] = minX - radius;
          else if (nearest === right) ants.posX[index] = maxX + radius;
          else if (nearest === up) ants.posY[index] = minY - radius;
          else ants.posY[index] = maxY + radius;
        }
      }
    }
  }
}
