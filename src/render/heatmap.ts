import type { MarkerGrid } from "../sim/marker_grid.js";
import { kNoOwner } from "../sim/types.js";
import { trailHex, type Theme } from "./theme.js";
import { HeatmapMode } from "./view_settings.js";

// Rec. 709 luma, used to grey a contested trail.
const kLumaRed = 0.2126;
const kLumaGreen = 0.7152;
const kLumaBlue = 0.0722;
// A cell whose rival is as strong as its owner loses this share of the owner's colour.
const kContestGrey = 0.55;

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Turns the marker grid into one RGBA pixel per cell.
 * `colorByColony[id]` is the palette index that colony picked; trails take their colour from it, never from the id.
 * Row 0 of the output is the world's top row; the texture path draws it upright.
 */
export function fillHeatmapRgba(
  grid: MarkerGrid,
  mode: HeatmapMode,
  theme: Theme,
  colorByColony: readonly number[],
  rgbaOut: Uint8Array,
): void {
  if (mode === HeatmapMode.Off) {
    rgbaOut.fill(0);
    return;
  }
  const cells = grid.width * grid.height;
  for (let cell = 0; cell < cells; cell++) {
    const offset = cell * 4;
    if (mode === HeatmapMode.DualChannel) {
      // Both channels sum every colony's layer, so contested ground is the
      // brightest, whichever colony laid the trail.
      let home = 0;
      let food = 0;
      for (let colony = 0; colony < grid.colonies; colony++) {
        const index = colony * cells + cell;
        home += grid.toHome[index];
        food += grid.toFood[index];
      }
      // The hue is the pure mix of the two trail colours. The amount goes to alpha
      // alone, so a faint trail keeps its colour instead of being dimmed twice.
      const total = home + food;
      if (total === 0) {
        rgbaOut.fill(0, offset, offset + 4);
        continue;
      }
      const share = food / total;
      rgbaOut[offset] = Math.round(mix(theme.heatHome.r, theme.heatFood.r, share));
      rgbaOut[offset + 1] = Math.round(mix(theme.heatHome.g, theme.heatFood.g, share));
      rgbaOut[offset + 2] = Math.round(mix(theme.heatHome.b, theme.heatFood.b, share));
      rgbaOut[offset + 3] = Math.round(255 * theme.heatAlpha * Math.min(1, Math.sqrt(total)));
      continue;
    }

    const owner = grid.owner[cell];
    if (owner === kNoOwner || owner >= grid.colonies) {
      rgbaOut.fill(0, offset, offset + 4);
      continue;
    }
    // Every colony's strength on this cell is the stronger of its two trails.
    let total = 0;
    let rival = 0;
    let ownerHome = 0;
    let ownerFood = 0;
    for (let colony = 0; colony < grid.colonies; colony++) {
      const index = colony * cells + cell;
      const home = grid.toHome[index];
      const food = grid.toFood[index];
      const strength = Math.max(home, food);
      total += strength;
      if (colony === owner) {
        ownerHome = home;
        ownerFood = food;
      } else if (strength > rival) {
        rival = strength;
      }
    }
    if (total === 0) {
      rgbaOut.fill(0, offset, offset + 4);
      continue;
    }

    // Food trails are bright and home trails dimmer, in the owner's own hue.
    const ownerStrength = Math.max(ownerHome, ownerFood);
    const trailSum = ownerHome + ownerFood;
    const typeShare = trailSum > 0 ? ownerFood / trailSum : 0;
    const base = trailHex(colorByColony[owner] ?? 0);
    const brightness = 0.6 + 0.4 * typeShare;
    let red = ((base >> 16) & 0xff) * brightness;
    let green = ((base >> 8) & 0xff) * brightness;
    let blue = (base & 0xff) * brightness;

    // Contested ground loses saturation. Hues never mix, so a rival never reads as a third colony.
    const contest = ownerStrength > 0 ? Math.min(1, rival / ownerStrength) : rival > 0 ? 1 : 0;
    const luma = kLumaRed * red + kLumaGreen * green + kLumaBlue * blue;
    const grey = kContestGrey * contest;
    red = mix(red, luma, grey);
    green = mix(green, luma, grey);
    blue = mix(blue, luma, grey);

    rgbaOut[offset] = Math.round(red);
    rgbaOut[offset + 1] = Math.round(green);
    rgbaOut[offset + 2] = Math.round(blue);
    rgbaOut[offset + 3] = Math.round(255 * theme.heatAlpha * Math.min(1, Math.sqrt(total)));
  }
}
