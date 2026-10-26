import {
  FoodKind,
  ObstacleKind,
  addColony,
  addFood,
  makeSetup,
  paintCells,
  paintRect,
  type SetupRect,
  type WorldSetup,
} from "./setup.js";

export interface PresetInfo {
  id: string;
  name: string;
}

export const kPresetIds = ["meadow", "dunes", "creek", "boulder", "maze", "highway", "blank"] as const;

const kPresetNames: Record<string, string> = {
  meadow: "Meadow",
  dunes: "Dunes",
  creek: "Creek",
  boulder: "Boulder",
  maze: "Maze",
  highway: "Highway",
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

const kMazeWallThickness = 24;
const kMazeGap = 160;

// Three walls split the map into four lanes; the only route between the nest
// and the food snakes through the gaps at alternating ends. The left ends of
// the two lower walls are the breach segments: clearing them opens a straight
// 840 u climb up the left side.
function mazeRect(x: number, wallY: number, width: number): SetupRect {
  return { pos: { x, y: wallY - kMazeWallThickness / 2 }, size: { x: width, y: kMazeWallThickness } };
}

function maze(seed: number): WorldSetup {
  const setup = makeSetup({ x: 1920, y: 1080 }, seed, "maze");
  addColony(setup, { x: 90, y: 960 }, 0, 200);
  addFood(setup, { x: 90, y: 120 }, 20000, FoodKind.Seeds);
  paintRect(setup, ObstacleKind.Rock, mazeRect(0, 270, 1760));
  paintRect(setup, ObstacleKind.Rock, mazeRect(kMazeGap, 540, 1920 - kMazeGap));
  paintRect(setup, ObstacleKind.Rock, mazeRect(0, 810, 1760));
  setup.breach = [mazeRect(0, 270, kMazeGap), mazeRect(0, 810, kMazeGap)];
  // The route is about 7,000 u long, so an ant must not run out of energy
  // partway; the preset overrides the burn rate rather than every preset's.
  // The route is long enough that an ant on the default burn gives up looking
  // before it arrives: the search budget is (energyMax - exhaustedAt) / burn,
  // and the food lies 157 s away.
  setup.paramOverrides = { energyBurn: 0.2 };
  return setup;
}

// Two long walls leave a 180 u corridor. Opposing streams meet in it, so they
// either split into lanes or jam. Food sits at the far end.
const kHighwayWallThickness = 16;

export function highway(seed: number): WorldSetup {
  const setup = makeSetup({ x: 2400, y: 900 }, seed, "highway");
  addColony(setup, { x: 200, y: 450 }, 1, 600);
  addFood(setup, { x: 2200, y: 450 }, 20000, FoodKind.Seeds);
  for (const wallY of [360, 540]) {
    paintRect(setup, ObstacleKind.Rock, {
      pos: { x: 400, y: wallY - kHighwayWallThickness / 2 },
      size: { x: 1600, y: kHighwayWallThickness },
    });
  }
  setup.paramOverrides = { energyBurn: 0.3 };
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
    case "maze":
      return maze(seed);
    case "highway":
      return highway(seed);
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
