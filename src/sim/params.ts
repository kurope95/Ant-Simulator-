export interface SimParams {
  simHz: number;
  worldW: number;
  worldH: number;
  markerCell: number;
  obstacleCell: number;
  hashCell: number;
  chunkSize: number;
  antRadius: number;
  antLength: number;
  antSpeed: number;
  speedJitter: number;
  turnRate: number;
  sensorRadius: number;
  sensorHalfFovDeg: number;
  followerSamples: number;
  explorerSamples: number;
  fallbackRays: number;
  fallbackRange: number;
  lookAhead: number;
  explorerRatio: number;
  wanderIntervalFollower: number;
  wanderIntervalExplorer: number;
  wanderAngleFollower: number;
  wanderAngleExplorer: number;
  markerDropDist: number;
  emissionDecay: number;
  markerHalfLife: number;
  markerEps: number;
  markerDetectMin: number;
  territoryRule: boolean;
  foreignErasureFactor: number;
  // An owner keeps a cell until a rival is this many times its strength (M1.7).
  flipMargin: number;
  // How much rival scent takes off an ant's own signal on a cell; 0 ignores rivals (M1.7).
  foreignAversion: number;
  stuckTimeout: number;
  stuckTurnJitter: number;
  degradeTime: number;
  degradeFactor: number;
  crowdLimit: number;
  crowdRadiusFactor: number;
  zoneMargin: number;
  energyMax: number;
  energyBurn: number;
  exhaustedAt: number;
  homingEnabled: boolean;
  homingDrift: number;
  pushOnSignal: number;
  mass: number;
  massCarrying: number;
  spawnCost: number;
  // Seconds for an emptied food pile to grow back to its starting size; 0 never (spec §4.4).
  foodRegrowTime: number;
  // Life cycle (spec §5.6). Off: free meals at home, no old age, a birth the moment food allows.
  lifeCycle: boolean;
  // Average life of an ant in seconds, varied per ant by ±lifespanJitter.
  antLifespan: number;
  lifespanJitter: number;
  // Stored food one unit of energy costs when an ant eats at its own nest.
  foodPerEnergy: number;
  // Seconds of the colony's eating the queen keeps back before she lays.
  reserveSeconds: number;
  // Eggs per second: a base rate plus a share per living ant (the nurses).
  birthRateBase: number;
  birthRatePerAnt: number;
  // Births that can bank up while the stores are low.
  birthBurst: number;
  // Self-balancing colony (spec §5.8). Off: every ant is always out foraging.
  restAtHome: boolean;
  // A resting ant burns this share of the normal energy rate.
  restBurnFactor: number;
  // Resting ants each delivery calls out of the nest.
  recruitPerDelivery: number;
  // Only a pile with at least this much left after the pickup is worth calling others out for.
  recruitMinPile: number;
  // Share of the resting ants that leave as scouts each second.
  scoutRate: number;
  // The queen lays by the food coming in per ant per minute: not at all at or
  // below layIncomeNone, at full rate from layIncomeFull.
  layIncomeNone: number;
  layIncomeFull: number;
  // She also lays while the nest is nearly empty (every ant called out to work):
  // fully below layEmptyBelow resting, not for this reason from layEmptyUntil.
  layEmptyBelow: number;
  layEmptyUntil: number;
  nestBaseR: number;
  nestGrowth: number;
  foodBaseR: number;
  foodRefAmount: number;
  foodMinR: number;
  newColonyAnts: number;
  maxAntsTotal: number;
  tHorizon: number;
  rAvoidMax: number;
  maxNeighbours: number;
  avoidMaxSpeedFactor: number;
  // Weight of the own right in each sidestep direction (0: straight away from the other ant).
  sidestepRightBias: number;
  // Drift to the own right while oncoming ants are ahead, as a share of the avoidance cap (0: off).
  laneKeep: number;
  pbdIterations: number;
  antCollisions: boolean;
  nestExemptFactor: number;
  legsMinPx: number;
  stepThreshold: number;
  stepDuration: number;
  stepLead: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export function defaultParams(): SimParams {
  return {
    simHz: 60,
    worldW: 1920,
    worldH: 1080,
    markerCell: 8,
    obstacleCell: 4,
    hashCell: 6,
    chunkSize: 1024,
    antRadius: 2.5,
    antLength: 10,
    antSpeed: 50,
    speedJitter: 0.10,
    turnRate: 6,
    sensorRadius: 32,
    sensorHalfFovDeg: 60,
    followerSamples: 25,
    explorerSamples: 6,
    fallbackRays: 12,
    fallbackRange: 48,
    lookAhead: 20,
    explorerRatio: 0.10,
    wanderIntervalFollower: 0.4,
    wanderIntervalExplorer: 0.25,
    wanderAngleFollower: 0.3,
    wanderAngleExplorer: 1.0,
    markerDropDist: 8,
    emissionDecay: 0.11,
    markerHalfLife: 15,
    markerEps: 1e-4,
    markerDetectMin: 1e-3,
    territoryRule: true,
    foreignErasureFactor: 0.5,
    flipMargin: 1.25,
    foreignAversion: 0.35,
    stuckTimeout: 2.5,
    stuckTurnJitter: 0.6,
    degradeTime: 3.0,
    degradeFactor: 0.5,
    crowdLimit: 4,
    crowdRadiusFactor: 3,
    zoneMargin: 16,
    energyMax: 100,
    energyBurn: 0.5,
    exhaustedAt: 60,
    homingEnabled: true,
    homingDrift: 0.04,
    pushOnSignal: 0.4,
    mass: 1,
    massCarrying: 3,
    spawnCost: 5,
    foodRegrowTime: 600,
    lifeCycle: true,
    antLifespan: 600,
    lifespanJitter: 0.25,
    foodPerEnergy: 0.01,
    reserveSeconds: 120,
    birthRateBase: 1,
    birthRatePerAnt: 0.004,
    birthBurst: 3,
    restAtHome: true,
    restBurnFactor: 0.25,
    recruitPerDelivery: 1,
    recruitMinPile: 100,
    scoutRate: 0.002,
    layIncomeNone: 3,
    layIncomeFull: 6,
    layEmptyBelow: 0.05,
    layEmptyUntil: 0.2,
    nestBaseR: 20,
    nestGrowth: 0.4,
    foodBaseR: 12,
    foodRefAmount: 500,
    foodMinR: 4,
    newColonyAnts: 200,
    maxAntsTotal: 50000,
    tHorizon: 1.0,
    rAvoidMax: 24,
    maxNeighbours: 16,
    avoidMaxSpeedFactor: 0.5,
    sidestepRightBias: 0,
    laneKeep: 0,
    pbdIterations: 4,
    antCollisions: true,
    nestExemptFactor: 1.5,
    legsMinPx: 18,
    stepThreshold: 3.0,
    stepDuration: 0.08,
    stepLead: 0.1,
    shadowOffsetX: 2,
    shadowOffsetY: 3,
  };
}

export function markerDecayFactor(params: SimParams, dt: number): number {
  return Math.pow(2, -dt / params.markerHalfLife);
}

export function validate(params: SimParams): string | null {
  if (!(params.simHz > 0)) return "sim_hz must be positive";
  if (!(params.markerCell > 0) || !(params.obstacleCell > 0) || !(params.hashCell > 0)) {
    return "grid cell sizes must be positive";
  }
  if (params.hashCell < 2 * params.antRadius) return "hash_cell must be at least 2 * ant_radius";
  if (!(params.chunkSize >= 1)) return "chunk_size must be at least 1";
  if (!(params.markerHalfLife > 0)) return "marker_half_life must be positive";
  return null;
}
