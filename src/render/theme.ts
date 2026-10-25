import { rgba, rgb, type Rgba8 } from "../core/color.js";

export interface Theme {
  name: string;
  outside: Rgba8;
  ground: Rgba8;
  grid: Rgba8;
  border: Rgba8;
  food: Rgba8;
  heatHome: Rgba8;
  heatFood: Rgba8;
  heatAlpha: number;
  rock: Rgba8;
  water: Rgba8;
  sand: Rgba8;
  mud: Rgba8;
  speckle: Rgba8;
}

const kOutside = rgba(0x05, 0x07, 0x0a, 255);
const kBorder = rgba(0xeb, 0xf1, 0xe5, 46);
const kHeatHome = rgba(0x4f, 0xc3, 0xb0, 255);
const kHeatFood = rgba(0xf0, 0xb4, 0x5e, 255);
const kHeatAlpha = 0.62;
const kRock = rgba(0x2c, 0x30, 0x34, 255);
const kWater = rgba(0x0f, 0x2f, 0x3c, 255);
const kSand = rgba(0x3a, 0x31, 0x22, 255);
const kMud = rgba(0x25, 0x1f, 0x17, 255);

function makeTheme(
  name: string,
  groundHex: number,
  grid: Rgba8,
  speckleHex: number,
  foodHex: number,
): Theme {
  return {
    name,
    outside: kOutside,
    ground: rgb(groundHex),
    grid,
    border: kBorder,
    food: rgb(foodHex),
    heatHome: kHeatHome,
    heatFood: kHeatFood,
    heatAlpha: kHeatAlpha,
    rock: kRock,
    water: kWater,
    sand: kSand,
    mud: kMud,
    speckle: rgb(speckleHex),
  };
}

export function meadowTheme(): Theme {
  return makeTheme("Meadow", 0x0b100d, rgba(0x59, 0x5f, 0x59, 15), 0x2e3d2a, 0xa8d86b);
}

export function dunesTheme(): Theme {
  return makeTheme("Dunes", 0x2a2117, rgba(0x6e, 0x6a, 0x5f, 15), 0x4a3b28, 0xc8b25a);
}

export function creekTheme(): Theme {
  return makeTheme("Creek", 0x0d1412, rgba(0x5b, 0x61, 0x5c, 15), 0x23403a, 0x8fd9a8);
}

export function boulderTheme(): Theme {
  return makeTheme("Boulder", 0x14171a, rgba(0x5f, 0x63, 0x61, 15), 0x2e353b, 0xb8c46a);
}

export function blankTheme(): Theme {
  return makeTheme("Blank", 0x0b0e0f, rgba(0x59, 0x5d, 0x5a, 15), 0x23282a, 0x9bd48a);
}

export function themeForPreset(presetId: string): Theme {
  switch (presetId) {
    case "dunes":
      return dunesTheme();
    case "creek":
      return creekTheme();
    case "boulder":
      return boulderTheme();
    case "maze":
      return boulderTheme();
    case "blank":
      return blankTheme();
    default:
      return meadowTheme();
  }
}
