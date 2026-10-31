import type { MarkerChannel } from "./marker_grid.js";
import type { ColonyId } from "./types.js";

export interface DepositEvent {
  cell: number;
  colony: ColonyId;
  channel: MarkerChannel;
  strength: number;
}

export interface DegradeEvent {
  cell: number;
  colony: ColonyId;
  channel: MarkerChannel;
}

export enum ContactKind {
  Food,
  Nest,
  // target is the index in world.corpses.items.
  Corpse,
  // A forager reached a pile with nothing left on it (spec §5.4): it goes home.
  BarePile,
}

export interface ContactEvent {
  antIndex: number;
  kind: ContactKind;
  target: number;
}

// A bite: indices are valid for the tick that wrote them (conflict design §4).
export interface AttackEvent {
  attacker: number;
  victim: number;
  damage: number;
}

export interface ChunkEvents {
  deposits: DepositEvent[];
  degrades: DegradeEvent[];
  contacts: ContactEvent[];
  attacks: AttackEvent[];
}

export function makeChunkEvents(): ChunkEvents {
  return { deposits: [], degrades: [], contacts: [], attacks: [] };
}
