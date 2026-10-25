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
  pushOnSignal: number;
  mass: number;
  massCarrying: number;
  spawnCost: number;
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
  pbdIterations: number;
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
    explorerSamples: 4,
    fallbackRays: 12,
    fallbackRange: 48,
    explorerRatio: 0.10,
    wanderIntervalFollower: 0.4,
    wanderIntervalExplorer: 0.25,
    wanderAngleFollower: 0.3,
    wanderAngleExplorer: 1.0,
    markerDropDist: 8,
    emissionDecay: 0.11,
    markerHalfLife: 7.7,
    markerEps: 1e-4,
    markerDetectMin: 1e-3,
    territoryRule: true,
    foreignErasureFactor: 0.5,
    stuckTimeout: 2.5,
    stuckTurnJitter: 0.6,
    degradeTime: 3.0,
    degradeFactor: 0.5,
    crowdLimit: 4,
    crowdRadiusFactor: 3,
    zoneMargin: 16,
    energyMax: 100,
    energyBurn: 1.0,
    exhaustedAt: 30,
    pushOnSignal: 0.4,
    mass: 1,
    massCarrying: 3,
    spawnCost: 5,
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
    pbdIterations: 2,
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
