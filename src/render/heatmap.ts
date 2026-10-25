import { colonyHex } from "../sim/palette.js";
import type { MarkerGrid } from "../sim/marker_grid.js";
import { kNoOwner } from "../sim/types.js";
import type { Theme } from "./theme.js";
import { HeatmapMode } from "./view_settings.js";

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Turns the marker grid into one RGBA pixel per cell.
 * Row 0 of the output is the world's top row; the texture path draws it upright.
 */
export function fillHeatmapRgba(
  grid: MarkerGrid,
  mode: HeatmapMode,
  theme: Theme,
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
      rgbaOut[offset] = 0;
      rgbaOut[offset + 1] = 0;
      rgbaOut[offset + 2] = 0;
      rgbaOut[offset + 3] = 0;
      continue;
    }
    const index = owner * cells + cell;
    const home = grid.toHome[index];
    const food = grid.toFood[index];
    const hex = colonyHex(owner);
    const strength = Math.min(Math.max(home, food), 1);
    rgbaOut[offset] = (hex >> 16) & 0xff;
    rgbaOut[offset + 1] = (hex >> 8) & 0xff;
    rgbaOut[offset + 2] = hex & 0xff;
    rgbaOut[offset + 3] = Math.round(255 * Math.sqrt(strength) * theme.heatAlpha);
  }
}
