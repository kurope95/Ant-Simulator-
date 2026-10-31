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
  | "foodSpreadRate"
  | "foodSproutRate"
  | "recruitPerDelivery"
  | "scoutRate"
  | "layIncomeNone"
  | "layIncomeFull"
  | "foreignErasureFactor"
  | "foreignAversion"
  | "tHorizon"
  | "aggression"
  | "warriorRatio"
  | "warriorCall"
  | "guardEdge"
  | "workerEngage"
  | "biteDps"
  | "retreatHealth"
  | "battleHalfLife";

// "behaviour" is shown first: the controls that change how the colonies behave most.
export type ParamGroup = "behaviour" | "movement" | "trails" | "colony" | "fighting";

export interface ParamSpec {
  key: ParamKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  scale: number;
  group: ParamGroup;
  // One plain sentence under the slider: what it does in the game.
  hint?: string;
  // Decimals shown; small-step controls default to one decimal.
  digits?: number;
}

const kSpecs: readonly ParamSpec[] = [
  { key: "antSpeed", label: "Walking speed", hint: "How fast ants walk, in map units per second.", unit: "u/s", min: 10, max: 120, step: 1, scale: 1, group: "movement" },
  { key: "turnRate", label: "Turning speed", hint: "How quickly an ant can change direction. Low: wide, lazy curves.", unit: "rad/s", min: 1, max: 12, step: 0.5, scale: 1, group: "movement" },
  { key: "sensorRadius", label: "Smell and sight range", hint: "How far ahead an ant smells trails and sees food or its nest.", unit: "u", min: 10, max: 80, step: 1, scale: 1, group: "movement" },
  { key: "sensorHalfFovDeg", label: "Smell and sight width", hint: "How wide the cone in front of an ant is, to each side.", unit: "°", min: 20, max: 90, step: 1, scale: 1, group: "movement" },
  { key: "explorerRatio", label: "Explorers", hint: "Share of newborn workers that wander off to search instead of following trails.", unit: "%", min: 0, max: 100, step: 1, scale: 100, group: "behaviour" },
  // How far ahead an ant looks for a head-on meeting (spec §6.1). Changing it takes effect on the next tick.
  { key: "tHorizon", label: "Look ahead to avoid bumping", hint: "How many seconds ahead ants plan to sidestep each other.", unit: "s", min: 0.25, max: 2.5, step: 0.05, scale: 1, group: "movement", digits: 2 },
  { key: "markerHalfLife", label: "Trails fade by half every", hint: "Unused scent loses half its strength in this many seconds. Short: only busy trails last.", unit: "s", min: 1, max: 30, step: 0.1, scale: 1, group: "behaviour" },
  { key: "emissionDecay", label: "Scent weakens on the way", hint: "Ants lay weaker scent the longer ago they left the food or nest, so trails point the way. Higher: shorter trails.", unit: "", min: 0.005, max: 0.2, step: 0.005, scale: 1, group: "trails", digits: 3 },
  { key: "markerDropDist", label: "Scent drop spacing", hint: "An ant leaves a drop of scent every this many map units.", unit: "u", min: 2, max: 24, step: 1, scale: 1, group: "trails" },
  { key: "foreignErasureFactor", label: "Wiping rivals' scent", hint: "How much an ant's scent wipes out a rival colony's scent on the same spot.", unit: "", min: 0, max: 1, step: 0.05, scale: 1, group: "trails", digits: 2 },
  { key: "foreignAversion", label: "Avoiding rivals' scent", hint: "How much a rival's scent puts an ant off a spot.", unit: "", min: 0, max: 1, step: 0.05, scale: 1, group: "trails", digits: 2 },
  // How organic the trails are (spec §4.2): 100% tops a spot up to the ant's own
  // strength; less closes only that share of the gap, so one ant cannot refill a trail.
  { key: "trailRefresh", label: "Scent per passing ant", hint: "100%: one ant tops a trail up to full. Lower: each ant adds only that share, so trails need traffic.", unit: "%", min: 10, max: 100, step: 5, scale: 100, group: "trails" },
  { key: "trailUnusedLife", label: "Unused trail gone after", hint: "A trail spot no ant of its colony walked over for this long disappears. 0: never.", unit: "s", min: 0, max: 300, step: 5, scale: 1, group: "trails" },
  { key: "degradeTime", label: "Stuck ants erase their trail for", hint: "An ant stuck in a crowd or a loop wipes its own colony's trail under it for this long, so others are not led into the trap. Not about fading.", unit: "s", min: 0.5, max: 10, step: 0.5, scale: 1, group: "trails" },
  { key: "energyBurn", label: "Hunger speed", hint: "Energy an ant uses per second. Higher: ants must eat more often.", unit: "/s", min: 0.1, max: 5, step: 0.1, scale: 1, group: "colony" },
  { key: "spawnCost", label: "Food per newborn", hint: "Stored food the queen uses up for each egg.", unit: "food", min: 1, max: 20, step: 1, scale: 1, group: "colony" },
  // Self-balancing colony (spec §5.8).
  { key: "recruitPerDelivery", label: "Ants a rich find calls out", hint: "Resting ants each delivery from a big food pile sends out from the nest.", unit: "", min: 0, max: 4, step: 0.25, scale: 1, group: "behaviour", digits: 2 },
  { key: "scoutRate", label: "Resting ants scouting", hint: "Share of the ants resting at home that go out to search on their own each minute.", unit: "%/min", min: 0, max: 60, step: 1, scale: 6000, group: "colony" },
  { key: "layIncomeNone", label: "Queen stops laying below", hint: "Food brought home per ant per minute below which the queen lays no eggs.", unit: "food/ant/min", min: 0, max: 5, step: 0.1, scale: 1, group: "colony" },
  { key: "layIncomeFull", label: "Queen lays fully from", hint: "Food brought home per ant per minute from which the queen lays at full speed.", unit: "food/ant/min", min: 0.5, max: 10, step: 0.1, scale: 1, group: "behaviour" },
  // Living food: growth as a share of the pile's own size per minute; 0 turns it off.
  { key: "foodSpreadRate", label: "Food piles spread", hint: "How often a full food pile seeds a small new pile nearby, per minute. Fewer when it is half eaten.", unit: "/min", min: 0, max: 3, step: 0.1, scale: 1, group: "behaviour" },
  { key: "foodSproutRate", label: "Wild food sprouts", hint: "How often a small new food pile sprouts somewhere random on the map, per minute.", unit: "/min", min: 0, max: 3, step: 0.1, scale: 1, group: "behaviour" },
  { key: "foodGrowthRate", label: "Food grows by", hint: "How fast a food pile grows back, as a share of its own size per minute. A stripped pile is dead for good.", unit: "%/min", min: 0, max: 200, step: 5, scale: 100, group: "behaviour" },
  // Colony conflict (fight branch). Warrior share applies to ants born from now on.
  { key: "aggression", label: "Aggression", hint: "How readily all ants fight: 100% as tuned, 0% nobody starts fights, 300% three times as bold.", unit: "%", min: 0, max: 300, step: 10, scale: 100, group: "behaviour" },
  { key: "warriorRatio", label: "Warriors among newborns", hint: "Share of newborn ants that become warriors.", unit: "%", min: 0, max: 40, step: 1, scale: 100, group: "fighting" },
  { key: "warriorCall", label: "Warriors answering a fight", hint: "Share of warriors that leave their post to follow battle smell.", unit: "%", min: 0, max: 100, step: 5, scale: 100, group: "fighting" },
  { key: "guardEdge", label: "Guards keep to column edge", hint: "Where warriors walk along a food column: 0 the middle, higher the outer edge.", unit: "", min: 0, max: 0.9, step: 0.05, scale: 1, group: "fighting", digits: 2 },
  { key: "workerEngage", label: "Workers that fight back", hint: "Share of workers willing to fight a rival blocking their way.", unit: "%", min: 0, max: 100, step: 5, scale: 100, group: "fighting" },
  { key: "biteDps", label: "Bite strength", hint: "Health a worker's bite takes per second; warriors bite several times harder.", unit: "/s", min: 1, max: 40, step: 1, scale: 1, group: "fighting" },
  { key: "retreatHealth", label: "Retreat below health", hint: "Health under which a fighting ant breaks off and runs home. Higher: fewer deaths.", unit: "%", min: 0, max: 90, step: 5, scale: 100, group: "fighting" },
  { key: "battleHalfLife", label: "Battle smell fades by half every", hint: "How long the alarm smell of a fight lingers and draws warriors.", unit: "s", min: 1, max: 30, step: 0.5, scale: 1, group: "fighting" },
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
