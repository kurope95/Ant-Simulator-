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
  // Guards the colony's trails and answers battle smell (conflict design §3).
  Warrior,
}

// Where an ant is in a fight (conflict design §4).
export enum Combat {
  None,
  Standoff,
  Fight,
  Retreat,
}

// Ants.foe when the ant has no foe.
export const kNoFoe = 0xffffffff;

export enum RandStream {
  WanderOffset = 1,
  WanderInterval,
  StuckTurn,
  SpawnHeading,
  SpawnRole,
  SpeedJitter,
  ContactTurn,
  HomingDrift,
  Lifespan,
  StartingAge,
  Warrior,
  Boldness,
}
