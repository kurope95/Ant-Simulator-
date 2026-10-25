import { colonyHex } from "../sim/palette.js";
import type { MarkerGrid } from "../sim/marker_grid.js";
import { kNoOwner } from "../sim/types.js";
import type { Theme } from "./theme.js";
import { HeatmapMode } from "./view_settings.js";

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
    const owner = grid.owner[cell];
    if (owner === kNoOwner) {
      rgbaOut[offset] = 0;
      rgbaOut[offset + 1] = 0;
      rgbaOut[offset + 2] = 0;
      rgbaOut[offset + 3] = 0;
      continue;
    }
    const home = grid.toHome[cell];
    const food = grid.toFood[cell];
    if (mode === HeatmapMode.DualChannel) {
      rgbaOut[offset] = Math.round(Math.min(255, theme.heatHome.r * home + theme.heatFood.r * food));
      rgbaOut[offset + 1] = Math.round(
        Math.min(255, theme.heatHome.g * home + theme.heatFood.g * food),
      );
      rgbaOut[offset + 2] = Math.round(
        Math.min(255, theme.heatHome.b * home + theme.heatFood.b * food),
      );
      rgbaOut[offset + 3] = Math.round(255 * Math.min(home + food, 1) * theme.heatAlpha);
      continue;
    }
    const hex = colonyHex(owner);
    const strength = Math.min(Math.max(home, food), 1);
    rgbaOut[offset] = (hex >> 16) & 0xff;
    rgbaOut[offset + 1] = (hex >> 8) & 0xff;
    rgbaOut[offset + 2] = hex & 0xff;
    rgbaOut[offset + 3] = Math.round(255 * strength * theme.heatAlpha);
  }
}
