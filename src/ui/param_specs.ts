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
  | "energyBurn"
  | "spawnCost"
  | "tHorizon";

export type ParamGroup = "movement" | "trails" | "colony";

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
  { key: "explorerRatio", label: "Explorers", unit: "%", min: 0, max: 100, step: 1, scale: 100, group: "movement" },
  // How far ahead an ant looks for a head-on meeting (spec §6.1). Changing it takes effect on the next tick.
  { key: "tHorizon", label: "Avoidance look-ahead", unit: "s", min: 0.25, max: 2.5, step: 0.05, scale: 1, group: "movement", digits: 2 },
  { key: "markerHalfLife", label: "Trail half-life", unit: "s", min: 1, max: 30, step: 0.1, scale: 1, group: "trails" },
  { key: "emissionDecay", label: "Trail fade with distance", unit: "", min: 0.005, max: 0.2, step: 0.005, scale: 1, group: "trails", digits: 3 },
  { key: "markerDropDist", label: "Mark every", unit: "u", min: 2, max: 24, step: 1, scale: 1, group: "trails" },
  // degradeTime stays in SimParams but has no live control yet; the design
  // spec schedules it for M5.
  { key: "energyBurn", label: "Energy burn", unit: "/s", min: 0.1, max: 5, step: 0.1, scale: 1, group: "colony" },
  { key: "spawnCost", label: "Spawn cost", unit: "food", min: 1, max: 20, step: 1, scale: 1, group: "colony" },
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
