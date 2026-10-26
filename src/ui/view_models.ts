import { HeatmapMode } from "../render/view_settings.js";
import { colonyHex, colonyName } from "../sim/palette.js";
import type { World } from "../sim/world.js";

export type SpeedSetting = 1 | 2 | 4 | "max";

export interface ColonyRow {
  id: number;
  name: string;
  colorIndex: number;
  hex: number;
  population: number;
  delivered: number;
  foodPool: number;
  extinct: boolean;
}

const kIntegers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatInteger(value: number): string {
  return kIntegers.format(Math.round(value));
}

export function formatClock(ticks: number, simHz: number): string {
  const totalSeconds = Math.max(0, Math.floor(ticks / Math.max(simHz, 1)));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function speedLabel(speed: SpeedSetting): string {
  return speed === "max" ? "Max" : `${speed}×`;
}

export function trailModeLabel(mode: HeatmapMode): string {
  if (mode === HeatmapMode.Off) return "Off";
  if (mode === HeatmapMode.ColonyColor) return "Colonies";
  return "Trails";
}

export function colonyRows(world: World): ColonyRow[] {
  return [...world.colonies]
    .sort((a, b) => a.id - b.id)
    .map((colony) => ({
      id: colony.id,
      name: colonyName(colony.color),
      colorIndex: colony.color,
      hex: colonyHex(colony.color),
      population: colony.population,
      delivered: colony.deliveredTotal,
      foodPool: colony.foodPool,
      extinct: colony.extinct,
    }));
}

export function stateLabel(state: number): string {
  switch (state) {
    case 0:
      return "Foraging";
    case 1:
      return "Carrying food";
    case 2:
      return "Heading home, tired";
    default:
      return "Unknown";
  }
}

export function roleLabel(role: number): string {
  return role === 1 ? "Explorer" : "Follower";
}

// Energy as 0..1 of the cap (the energy a new ant starts with).
export function energyFraction(energy: number, cap = 100): number {
  if (!(cap > 0) || !(energy > 0)) return 0;
  return Math.min(1, energy / cap);
}

const kCompass = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];

// Heading in screen terms: 0 is east, a quarter turn is south (y grows down).
export function headingLabel(rad: number): string {
  const deg = ((rad * 180) / Math.PI) % 360;
  const wrapped = deg < 0 ? deg + 360 : deg;
  const index = Math.round(wrapped / 45) % 8;
  return `${kCompass[index]} ${Math.round(wrapped)}°`;
}
