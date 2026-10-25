import { presetInfo } from "../sim/presets.js";
import { validateSetup, type WorldSetup } from "../sim/setup.js";
import type { World } from "../sim/world.js";
import type { SpeedSetting } from "../ui/view_models.js";

export enum Screen {
  Home = "home",
  Builder = "builder",
  Run = "run",
}

export interface RunSummary {
  presetName: string;
  seed: number;
  seconds: number;
  ants: number;
  delivered: number;
  colonies: number;
}

export interface SessionState {
  screen: Screen;
  paused: boolean;
  speed: SpeedSetting;
  zen: boolean;
  lastRun: RunSummary | null;
}

export function newSession(screen: Screen = Screen.Home): SessionState {
  return { screen, paused: false, speed: 1, zen: false, lastRun: null };
}

export function startRun(
  state: SessionState,
  setup: WorldSetup,
): { state: SessionState; error: string | null } {
  const error = validateSetup(setup);
  if (error !== null) return { state, error };
  return {
    state: { ...state, screen: Screen.Run, paused: false, speed: 1, zen: false },
    error: null,
  };
}

export function pauseRun(state: SessionState): SessionState {
  if (state.screen !== Screen.Run) return state;
  return { ...state, paused: true };
}

export function resumeRun(state: SessionState): SessionState {
  if (state.screen !== Screen.Run) return state;
  return { ...state, paused: false };
}

export function togglePause(state: SessionState): SessionState {
  if (state.screen !== Screen.Run) return state;
  return { ...state, paused: !state.paused };
}

export function editRun(state: SessionState): SessionState {
  return { ...state, screen: Screen.Builder, paused: true, zen: false };
}

export function restartRun(state: SessionState): SessionState {
  return { ...state, screen: Screen.Run, paused: false, zen: false };
}

export function finishRun(state: SessionState, summary: RunSummary): SessionState {
  return { ...state, screen: Screen.Home, paused: false, zen: false, lastRun: summary };
}

export function backHome(state: SessionState): SessionState {
  return { ...state, screen: Screen.Home, paused: false, zen: false };
}

export function summarizeRun(world: World, setup: WorldSetup): RunSummary {
  let delivered = 0;
  for (const colony of world.colonies) delivered += colony.deliveredTotal;
  return {
    presetName: presetInfo(setup.presetId)?.name ?? setup.presetId,
    seed: setup.seed,
    seconds: Math.floor(world.tick / world.params.simHz),
    ants: world.ants.size(),
    delivered,
    colonies: world.colonies.length,
  };
}
