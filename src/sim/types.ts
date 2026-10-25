export const kMaxColonies = 8;
export type ColonyId = number;
export const kNoOwner = -1;

export enum AntState {
  Foraging,
  ReturningFood,
  ReturningExhausted,
}

export enum AntRole {
  Follower,
  Explorer,
}
