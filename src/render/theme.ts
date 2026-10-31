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
  groundA: Rgba8;
  groundB: Rgba8;
  rockDark: Rgba8;
  rockLight: Rgba8;
  waterShallow: Rgba8;
  waterDeep: Rgba8;
  sand: Rgba8;
  mud: Rgba8;
  speckle: Rgba8;
}

// Terrain colours as 0xRRGGBB. The terrain shader reads them as uniforms.
interface TerrainHex {
  groundA: number;
  groundB: number;
  rockDark: number;
  rockLight: number;
  waterShallow: number;
  waterDeep: number;
  sand: number;
  mud: number;
}

const kOutside = rgba(0x05, 0x07, 0x0a, 255);
const kBorder = rgba(0xeb, 0xf1, 0xe5, 46);
const kHeatHome = rgba(0x4f, 0xc3, 0xb0, 255);
const kHeatFood = rgba(0xf0, 0xb4, 0x5e, 255);
const kHeatAlpha = 0.62;

function makeTheme(
  name: string,
  groundHex: number,
  grid: Rgba8,
  speckleHex: number,
  foodHex: number,
  terrain: TerrainHex,
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
    groundA: rgb(terrain.groundA),
    groundB: rgb(terrain.groundB),
    rockDark: rgb(terrain.rockDark),
    rockLight: rgb(terrain.rockLight),
    waterShallow: rgb(terrain.waterShallow),
    waterDeep: rgb(terrain.waterDeep),
    sand: rgb(terrain.sand),
    mud: rgb(terrain.mud),
    speckle: rgb(speckleHex),
  };
}

// Luminous trail colours, one per palette entry in src/sim/palette.ts. Trails read these, not the
// darker colony colours, so a trail stays bright on dark ground.
const kTrailHex = [0xff7a57, 0xffc94d, 0x6aa8ff, 0x7fe08a, 0xc48cff, 0xff8fb0, 0x4fe3cc, 0xf2ead8];

export function trailHex(paletteIndex: number): number {
  const index = Number.isFinite(paletteIndex) && paletteIndex > 0 ? Math.trunc(paletteIndex) : 0;
  return kTrailHex[index % kTrailHex.length];
}

export function meadowTheme(): Theme {
  return makeTheme("Meadow", 0x0b100d, rgba(0x59, 0x5f, 0x59, 15), 0x2e3d2a, 0xa8d86b, {
    groundA: 0x141c12,
    groundB: 0x1d2918,
    rockDark: 0x3a3d40,
    rockLight: 0x8a8f94,
    waterShallow: 0x2f7d85,
    waterDeep: 0x123b4a,
    sand: 0x8c7650,
    mud: 0x3e3022,
  });
}

export function dunesTheme(): Theme {
  return makeTheme("Dunes", 0x2a2117, rgba(0x6e, 0x6a, 0x5f, 15), 0x4a3b28, 0xc8b25a, {
    groundA: 0x2b2116,
    groundB: 0x3a2c1c,
    rockDark: 0x4a4036,
    rockLight: 0xa39580,
    waterShallow: 0x3c8a8c,
    waterDeep: 0x17434f,
    sand: 0xb39a68,
    mud: 0x4a3827,
  });
}

export function creekTheme(): Theme {
  return makeTheme("Creek", 0x0d1412, rgba(0x5b, 0x61, 0x5c, 15), 0x23403a, 0x8fd9a8, {
    groundA: 0x121a16,
    groundB: 0x1a2620,
    rockDark: 0x383d3d,
    rockLight: 0x858c8a,
    waterShallow: 0x3a8f96,
    waterDeep: 0x0f3a4a,
    sand: 0x8a7a58,
    mud: 0x3a2f24,
  });
}

export function boulderTheme(): Theme {
  return makeTheme("Boulder", 0x14171a, rgba(0x5f, 0x63, 0x61, 15), 0x2e353b, 0xb8c46a, {
    groundA: 0x16191b,
    groundB: 0x1f2428,
    rockDark: 0x45494d,
    rockLight: 0x9aa0a5,
    waterShallow: 0x357a86,
    waterDeep: 0x133847,
    sand: 0x857457,
    mud: 0x3b3026,
  });
}

export function blankTheme(): Theme {
  return makeTheme("Blank", 0x0b0e0f, rgba(0x59, 0x5d, 0x5a, 15), 0x23282a, 0x9bd48a, {
    groundA: 0x0f1213,
    groundB: 0x15191a,
    rockDark: 0x3a3e41,
    rockLight: 0x868b8f,
    waterShallow: 0x2f7a84,
    waterDeep: 0x11384a,
    sand: 0x857350,
    mud: 0x382d22,
  });
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
    case "highway":
      return boulderTheme();
    case "blank":
      return blankTheme();
    default:
      return meadowTheme();
  }
}
