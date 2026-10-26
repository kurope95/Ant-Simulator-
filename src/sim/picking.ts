import type { World } from "./world.js";

// The uid of the ant nearest to (x, y) within `radius`, or -1. Ties go to the
// lower uid. A plain scan: it runs once per click, not per tick.
export function pickAnt(world: World, x: number, y: number, radius: number): number {
  const ants = world.ants;
  const limitSq = radius * radius;
  let bestUid = -1;
  let bestSq = Infinity;
  for (let i = 0; i < ants.size(); i++) {
    const dx = ants.posX[i] - x;
    const dy = ants.posY[i] - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > limitSq) continue;
    const uid = ants.uid[i];
    if (distSq < bestSq || (distSq === bestSq && uid < bestUid)) {
      bestSq = distSq;
      bestUid = uid;
    }
  }
  return bestUid;
}
