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

export interface PhaseTimings {
  ms: number[];
  totalMs: number;
}

export function emptyPhaseTimings(): PhaseTimings {
  return { ms: new Array(kPhaseCount).fill(0), totalMs: 0 };
}
