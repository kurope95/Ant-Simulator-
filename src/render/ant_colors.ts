import { mixHex } from "../core/color.js";

const kOutline = 0x0b0806;
const kDarkBrown = 0x1a120c;
// A full-size ant's waist, thorax and head are the colony colour this far toward dark brown.
const kBodyShade = 0.55;

// What an ant sprite is painted with, as CSS colours for the 2D canvas.
export interface AntColors {
  gaster: string; // the colony colour
  body: string; // waist, thorax and head: the colony colour, shaded toward dark brown
  outline: string;
  sheen: string; // a white highlight on the carapace
}

function cssRgb(hex: number): string {
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`;
}

export function antColors(colonyHex: number): AntColors {
  return {
    gaster: cssRgb(colonyHex),
    body: cssRgb(mixHex(colonyHex, kDarkBrown, kBodyShade)),
    outline: cssRgb(kOutline),
    sheen: "rgba(255,255,255,0.25)",
  };
}
