import type { SimParams } from "../sim/params.js";

export type ParamKey =
  | "antSpeed"
  | "turnRate"
  | "sensorRadius"
  | "sensorHalfFovDeg"
  | "explorerRatio"
  | "markerHalfLife"
  | "markerDropDist"
  | "emissionDecay"
  | "degradeTime"
  | "trailRefresh"
  | "trailUnusedLife"
  | "energyBurn"
  | "spawnCost"
  | "foodGrowthRate"
  | "recruitPerDelivery"
  | "scoutRate"
  | "layIncomeNone"
  | "layIncomeFull"
  | "foreignErasureFactor"
  | "foreignAversion"
  | "tHorizon";

// "behaviour" is shown first: the controls that change how the colonies behave most.
export type ParamGroup = "behaviour" | "movement" | "trails" | "colony";

export interface ParamSpec {
  key: ParamKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  scale: number;
  group: ParamGroup;
  // Decimals shown; small-step controls default to one decimal.
  digits?: number;
}

const kSpecs: readonly ParamSpec[] = [
  { key: "antSpeed", label: "Speed", unit: "u/s", min: 10, max: 120, step: 1, scale: 1, group: "movement" },
  { key: "turnRate", label: "Turn rate", unit: "rad/s", min: 1, max: 12, step: 0.5, scale: 1, group: "movement" },
  { key: "sensorRadius", label: "Sensor range", unit: "u", min: 10, max: 80, step: 1, scale: 1, group: "movement" },
  { key: "sensorHalfFovDeg", label: "Sensor angle", unit: "°", min: 20, max: 90, step: 1, scale: 1, group: "movement" },
  { key: "explorerRatio", label: "Explorers (wander off to search)", unit: "%", min: 0, max: 100, step: 1, scale: 100, group: "behaviour" },
  // How far ahead an ant looks for a head-on meeting (spec §6.1). Changing it takes effect on the next tick.
  { key: "tHorizon", label: "Avoidance look-ahead", unit: "s", min: 0.25, max: 2.5, step: 0.05, scale: 1, group: "movement", digits: 2 },
  { key: "markerHalfLife", label: "Trails fade by half every", unit: "s", min: 1, max: 30, step: 0.1, scale: 1, group: "behaviour" },
  { key: "emissionDecay", label: "Trail fade with distance", unit: "", min: 0.005, max: 0.2, step: 0.005, scale: 1, group: "trails", digits: 3 },
  { key: "markerDropDist", label: "Mark every", unit: "u", min: 2, max: 24, step: 1, scale: 1, group: "trails" },
  { key: "foreignErasureFactor", label: "Territory pressure", unit: "", min: 0, max: 1, step: 0.05, scale: 1, group: "trails", digits: 2 },
  { key: "foreignAversion", label: "Foreign scent aversion", unit: "", min: 0, max: 1, step: 0.05, scale: 1, group: "trails", digits: 2 },
  // How organic the trails are (spec §4.2): 100% tops a spot up to the ant's own
  // strength; less closes only that share of the gap, so one ant cannot refill a trail.
  { key: "trailRefresh", label: "Scent per passing ant", unit: "%", min: 10, max: 100, step: 5, scale: 100, group: "trails" },
  { key: "trailUnusedLife", label: "Unused trail gone after", unit: "s", min: 0, max: 300, step: 5, scale: 1, group: "trails" },
  { key: "degradeTime", label: "Degrade after", unit: "s", min: 0.5, max: 10, step: 0.5, scale: 1, group: "trails" },
  { key: "energyBurn", label: "Energy burn", unit: "/s", min: 0.1, max: 5, step: 0.1, scale: 1, group: "colony" },
  { key: "spawnCost", label: "Spawn cost", unit: "food", min: 1, max: 20, step: 1, scale: 1, group: "colony" },
  // Self-balancing colony (spec §5.8).
  { key: "recruitPerDelivery", label: "Ants a rich find calls out", unit: "", min: 0, max: 4, step: 0.25, scale: 1, group: "behaviour", digits: 2 },
  { key: "scoutRate", label: "Resting ants scouting", unit: "%/min", min: 0, max: 60, step: 1, scale: 6000, group: "colony" },
  { key: "layIncomeNone", label: "Queen stops laying below", unit: "food/ant/min", min: 0, max: 5, step: 0.1, scale: 1, group: "colony" },
  { key: "layIncomeFull", label: "Queen lays fully from", unit: "food/ant/min", min: 0.5, max: 10, step: 0.1, scale: 1, group: "behaviour" },
  // Living food: growth as a share of the pile's own size per minute; 0 turns it off.
  { key: "foodGrowthRate", label: "Food grows by", unit: "%/min", min: 0, max: 200, step: 5, scale: 100, group: "behaviour" },
];

export function paramSpecs(): readonly ParamSpec[] {
  return kSpecs;
}

export function specValue(spec: ParamSpec, params: SimParams): number {
  return params[spec.key] * spec.scale;
}

export function applySpecValue(spec: ParamSpec, params: SimParams, displayValue: number): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, displayValue));
  const snapped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
  const stored = snapped / spec.scale;
  params[spec.key] = stored;
  return stored;
}

export function formatSpecValue(spec: ParamSpec, displayValue: number): string {
  const digits = spec.digits ?? (spec.step < 1 ? 1 : 0);
  const text = digits > 0 ? displayValue.toFixed(digits) : String(Math.round(displayValue));
  return spec.unit.length > 0 ? `${text} ${spec.unit}` : text;
}
