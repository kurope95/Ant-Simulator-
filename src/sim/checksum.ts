import { mix32 } from "../core/rng.js";
import type { World } from "./world.js";

export function worldChecksum(world: World): number {
  const view = new DataView(new ArrayBuffer(4));
  let hash = 0;

  const foldInt = (value: number): void => {
    hash = mix32((hash ^ (value >>> 0)) >>> 0);
  };
  const foldFloat = (value: number): void => {
    view.setFloat32(0, value);
    hash = mix32((hash ^ view.getUint32(0)) >>> 0);
  };

  foldInt(world.tick);
  foldInt(world.seed);

  const ants = world.ants;
  const antCount = ants.size();
  foldInt(antCount);
  for (let i = 0; i < antCount; i++) {
    foldInt(ants.uid[i]);
    foldInt(ants.colony[i]);
    foldInt(ants.role[i]);
    foldInt(ants.state[i]);
    foldFloat(ants.posX[i]);
    foldFloat(ants.posY[i]);
    foldFloat(ants.heading[i]);
    foldFloat(ants.speed[i]);
    foldFloat(ants.energy[i]);
    foldFloat(ants.mass[i]);
    foldFloat(ants.timeSinceAnchor[i]);
    foldFloat(ants.degradeTimer[i]);
  }

  const markers = world.markers;
  for (let cell = 0; cell < markers.owner.length; cell++) {
    foldInt(markers.owner[cell]);
    foldFloat(markers.toHome[cell]);
    foldFloat(markers.toFood[cell]);
  }

  const obstacles = world.obstacles;
  foldInt(obstacles.kind.length);
  for (let cell = 0; cell < obstacles.kind.length; cell++) foldInt(obstacles.kind[cell]);

  for (const colony of world.colonies) {
    foldFloat(colony.nest.x);
    foldFloat(colony.nest.y);
    foldInt(colony.color);
    foldInt(colony.foodPool);
    foldInt(colony.population);
    foldInt(colony.deliveredTotal);
  }

  foldInt(world.food.items.length);
  for (const source of world.food.items) {
    foldInt(source.uid);
    foldFloat(source.pos.x);
    foldFloat(source.pos.y);
    foldInt(source.amount);
    foldInt(source.kind);
  }

  return hash;
}
