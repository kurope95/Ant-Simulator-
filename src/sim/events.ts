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
}

export interface ContactEvent {
  antIndex: number;
  kind: ContactKind;
  target: number;
}

export interface ChunkEvents {
  deposits: DepositEvent[];
  degrades: DegradeEvent[];
  contacts: ContactEvent[];
}

export function makeChunkEvents(): ChunkEvents {
  return { deposits: [], degrades: [], contacts: [] };
}
