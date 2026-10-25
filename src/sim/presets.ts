import {
  FoodKind,
  ObstacleKind,
  addColony,
  addFood,
  makeSetup,
  paintCells,
  type WorldSetup,
} from "./setup.js";

export interface PresetInfo {
  id: string;
  name: string;
}

export const kPresetIds = ["meadow", "dunes", "creek", "boulder", "blank"] as const;

const kPresetNames: Record<string, string> = {
  meadow: "Meadow",
  dunes: "Dunes",
  creek: "Creek",
  boulder: "Boulder",
  blank: "Blank",
};

function isPresetId(id: string): boolean {
  return (kPresetIds as readonly string[]).includes(id);
}

export function presetNames(): readonly string[] {
  return [...kPresetIds];
}

export function presetInfo(id: string): PresetInfo | null {
  if (!isPresetId(id)) return null;
  return { id, name: kPresetNames[id] };
}

function paint(setup: WorldSetup, kind: ObstacleKind, x: number, y: number, radius: number): void {
  paintCells(setup, kind, { x, y }, radius);
}

function meadow(seed: number): WorldSetup {
  const setup = makeSetup({ x: 1920, y: 1080 }, seed, "meadow");
  addColony(setup, { x: 400, y: 540 }, 0, 200);
  addFood(setup, { x: 1000, y: 720 }, 6000, FoodKind.Seeds);
  addFood(setup, { x: 1480, y: 400 }, 3000, FoodKind.Berries);
  paint(setup, ObstacleKind.Rock, 650, 250, 40);
  paint(setup, ObstacleKind.Rock, 1250, 250, 55);
  paint(setup, ObstacleKind.Rock, 1650, 800, 45);
  paint(setup, ObstacleKind.Rock, 900, 880, 35);
  paint(setup, ObstacleKind.Rock, 300, 880, 30);
  paint(setup, ObstacleKind.Sand, 1500, 200, 64);
  paint(setup, ObstacleKind.Sand, 1540, 200, 64);
  paint(setup, ObstacleKind.Sand, 1580, 200, 64);
  paint(setup, ObstacleKind.Mud, 700, 760, 60);
  return setup;
}

function dunes(seed: number): WorldSetup {
  const setup = makeSetup({ x: 1920, y: 1080 }, seed, "dunes");
  addColony(setup, { x: 420, y: 540 }, 0, 180);
  addColony(setup, { x: 1500, y: 540 }, 2, 180);
  addFood(setup, { x: 960, y: 540 }, 8000, FoodKind.Leaves);
  for (const [x, y] of [
    [300, 320],
    [700, 260],
    [1150, 300],
    [1600, 320],
    [250, 760],
    [700, 800],
    [1250, 780],
    [1700, 780],
  ]) {
    paint(setup, ObstacleKind.Sand, x, y, 64);
  }
  paint(setup, ObstacleKind.Mud, 900, 900, 60);
  paint(setup, ObstacleKind.Mud, 960, 900, 60);
  paint(setup, ObstacleKind.Mud, 1020, 900, 60);
  paint(setup, ObstacleKind.Rock, 960, 200, 50);
  paint(setup, ObstacleKind.Rock, 500, 850, 60);
  paint(setup, ObstacleKind.Rock, 1400, 850, 50);
  return setup;
}

function creek(seed: number): WorldSetup {
  const setup = makeSetup({ x: 2240, y: 1200 }, seed, "creek");
  addColony(setup, { x: 320, y: 600 }, 3, 200);
  addColony(setup, { x: 1920, y: 600 }, 5, 200);
  addFood(setup, { x: 640, y: 600 }, 5000, FoodKind.Seeds);
  addFood(setup, { x: 1600, y: 600 }, 5000, FoodKind.Berries);
  for (let y = 0; y <= setup.size.y; y += 40) {
    if ((y >= 280 && y <= 360) || (y >= 840 && y <= 920)) continue;
    paint(setup, ObstacleKind.Water, 1120, y, 60);
  }
  paint(setup, ObstacleKind.Sand, 1000, 600, 60);
  paint(setup, ObstacleKind.Sand, 1240, 600, 60);
  paint(setup, ObstacleKind.Rock, 1160, 320, 40);
  paint(setup, ObstacleKind.Rock, 1160, 880, 40);
  return setup;
}

function boulder(seed: number): WorldSetup {
  const setup = makeSetup({ x: 1920, y: 1080 }, seed, "boulder");
  addColony(setup, { x: 300, y: 540 }, 1, 220);
  addFood(setup, { x: 1400, y: 400 }, 7000, FoodKind.Seeds);
  addFood(setup, { x: 1400, y: 760 }, 4000, FoodKind.Berries);
  paint(setup, ObstacleKind.Rock, 700, 250, 60);
  paint(setup, ObstacleKind.Rock, 760, 800, 60);
  paint(setup, ObstacleKind.Rock, 1100, 200, 45);
  paint(setup, ObstacleKind.Rock, 1100, 880, 55);
  paint(setup, ObstacleKind.Rock, 1750, 200, 50);
  paint(setup, ObstacleKind.Rock, 1750, 760, 55);
  paint(setup, ObstacleKind.Mud, 500, 850, 50);
  return setup;
}

function blank(seed: number): WorldSetup {
  return makeSetup({ x: 1920, y: 1080 }, seed, "blank");
}

export function loadPreset(id: string, seed: number): WorldSetup | null {
  switch (id) {
    case "meadow":
      return meadow(seed);
    case "dunes":
      return dunes(seed);
    case "creek":
      return creek(seed);
    case "boulder":
      return boulder(seed);
    case "blank":
      return blank(seed);
    default:
      return null;
  }
}

export function quickStartSetup(seed: number): WorldSetup {
  const setup = loadPreset("meadow", seed);
  if (setup === null) throw new Error("the meadow preset is missing");
  return setup;
}
