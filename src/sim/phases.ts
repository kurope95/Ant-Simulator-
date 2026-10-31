export enum Phase {
  SpatialHash,
  Think,
  Events,
  Collisions,
  Removals,
  Decay,
  Stats,
}

export const kPhaseCount = 7;

export function phaseName(phase: Phase): string {
  switch (phase) {
    case Phase.SpatialHash: return "spatial_hash";
    case Phase.Think: return "think";
    case Phase.Events: return "events";
    case Phase.Collisions: return "collisions";
    case Phase.Removals: return "removals";
    case Phase.Decay: return "decay";
    case Phase.Stats: return "stats";
  }
}

// Pieces of the Think and Collisions phases, timed separately so the bench can
// show which part of a crowded tick costs what (M4 tuning).
export enum SubPhase {
  Avoidance,
  ThinkAnts,
  CollideHash,
  CollideAnts,
  CollideWalls,
  CollideVelocity,
}

export const kSubPhaseCount = 6;

export function subPhaseName(sub: SubPhase): string {
  switch (sub) {
    case SubPhase.Avoidance: return "avoidance";
    case SubPhase.ThinkAnts: return "think_ants";
    case SubPhase.CollideHash: return "collide_hash";
    case SubPhase.CollideAnts: return "collide_ants";
    case SubPhase.CollideWalls: return "collide_walls";
    case SubPhase.CollideVelocity: return "collide_vel";
  }
}

export interface PhaseTimings {
  ms: number[];
  sub: number[];
  totalMs: number;
}

export function emptyPhaseTimings(): PhaseTimings {
  return { ms: new Array(kPhaseCount).fill(0), sub: new Array(kSubPhaseCount).fill(0), totalMs: 0 };
}
