import { makeColony } from "./colony.js";
import { addFoodSource } from "./food.js";
import { spawnAtNest } from "./tick.js";
import type { World } from "./world.js";

export function scenarioNames(): readonly string[] {
  return ["sandbox"];
}

export function loadScenario(world: World, name: string): string | null {
  if (name !== "sandbox") return `unknown scenario: ${name}`;
  const colony = makeColony(0, { x: 400, y: 540 });
  world.colonies.push(colony);
  addFoodSource(world.food, { x: 1000, y: 720 }, 8000);
  for (let i = 0; i < world.params.newColonyAnts; i++) spawnAtNest(world, colony);
  return null;
}
