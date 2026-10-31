export const kMaxColonies = 8;
export type ColonyId = number;
export const kNoOwner = -1;

export enum AntState {
  Foraging,
  ReturningFood,
  ReturningExhausted,
  // Inside the nest with no work: not drawn, does not move, eats little (spec §5.8).
  Resting,
}

export enum AntRole {
  Follower,
  Explorer,
}

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
  LeaveNest,
  FoodSprout,
  FoodSproutPlace,
}
