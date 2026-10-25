import type { Vec2 } from "../core/vec2.js";
import { COLONY_PALETTE } from "../sim/palette.js";
import { loadPreset, presetInfo } from "../sim/presets.js";
import {
  FoodKind,
  ObstacleKind,
  addColony,
  addFood,
  kDefaultFoodAmount,
  kDefaultStartingAnts,
  kFoodAmountStep,
  kMaxBrushRadius,
  kMaxFoodAmount,
  kMaxStartingAnts,
  kMinBrushRadius,
  kMinFoodAmount,
  kMinStartingAnts,
  kStartingAntsStep,
  moveColony,
  moveFood,
  paintCells,
  removeColony,
  removeFood,
  setColonyColor,
  setColonyStartingAnts,
  setFoodAmount,
  setFoodKind,
  type WorldSetup,
} from "../sim/setup.js";

export enum BuilderTool {
  Select,
  Colony,
  Food,
  Rock,
  Water,
  Sand,
  Mud,
  Erase,
}

export interface BuilderSelection {
  kind: "colony" | "food";
  id: number;
}

const kInitialBrushRadius = 24;
const kSeedMax = 0xffffffff;

function clampInt(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(value)));
}

function snap(value: number, lo: number, step: number): number {
  return lo + Math.round((value - lo) / step) * step;
}

function clampColor(color: number): number {
  return clampInt(color, 0, COLONY_PALETTE.length - 1);
}

function clampKind(kind: FoodKind): FoodKind {
  return clampInt(kind, FoodKind.Seeds, FoodKind.Leaves) as FoodKind;
}

function clampFoodAmount(amount: number): number {
  const clamped = Math.min(kMaxFoodAmount, Math.max(kMinFoodAmount, Number.isFinite(amount) ? amount : kDefaultFoodAmount));
  return snap(clamped, kMinFoodAmount, kFoodAmountStep);
}

function clampStartingAnts(count: number): number {
  const clamped = Math.min(kMaxStartingAnts, Math.max(kMinStartingAnts, Number.isFinite(count) ? count : kDefaultStartingAnts));
  return snap(clamped, kMinStartingAnts, kStartingAntsStep);
}

function obstacleFor(tool: BuilderTool): ObstacleKind | null {
  switch (tool) {
    case BuilderTool.Rock:
      return ObstacleKind.Rock;
    case BuilderTool.Water:
      return ObstacleKind.Water;
    case BuilderTool.Sand:
      return ObstacleKind.Sand;
    case BuilderTool.Mud:
      return ObstacleKind.Mud;
    case BuilderTool.Erase:
      return ObstacleKind.None;
    default:
      return null;
  }
}

export class BuilderModel {
  private currentSetup: WorldSetup;
  private currentTool = BuilderTool.Select;
  private currentBrush = kInitialBrushRadius;
  private currentSelection: BuilderSelection | null = null;
  private currentDirty = false;
  private pending: string | null = null;
  private nextColor: number | null = null;
  private nextAnts = kDefaultStartingAnts;
  private nextFoodKind = FoodKind.Seeds;
  private nextFoodAmount = kDefaultFoodAmount;

  constructor(setup: WorldSetup) {
    this.currentSetup = setup;
  }

  get setup(): WorldSetup {
    return this.currentSetup;
  }

  get tool(): BuilderTool {
    return this.currentTool;
  }

  get brushRadius(): number {
    return this.currentBrush;
  }

  get selection(): BuilderSelection | null {
    return this.currentSelection;
  }

  get dirty(): boolean {
    return this.currentDirty;
  }

  get startingColor(): number | null {
    return this.nextColor;
  }

  get startingAnts(): number {
    return this.nextAnts;
  }

  get foodKind(): FoodKind {
    return this.nextFoodKind;
  }

  get foodAmount(): number {
    return this.nextFoodAmount;
  }

  setTool(tool: BuilderTool): void {
    this.currentTool = tool;
  }

  clearSelection(): void {
    this.currentSelection = null;
  }

  setBrushRadius(radius: number): void {
    this.currentBrush = clampInt(radius, kMinBrushRadius, kMaxBrushRadius);
  }

  setFoodKind(kind: FoodKind): void {
    this.nextFoodKind = clampKind(kind);
  }

  setFoodAmount(amount: number): void {
    this.nextFoodAmount = clampFoodAmount(amount);
  }

  setStartingAnts(count: number): void {
    this.nextAnts = clampStartingAnts(count);
  }

  setStartingColor(color: number): void {
    this.nextColor = clampColor(color);
  }

  setSeed(seed: number): boolean {
    if (!Number.isInteger(seed) || seed < 0 || seed > kSeedMax) return false;
    this.currentSetup.seed = seed;
    this.currentDirty = true;
    return true;
  }

  selectAt(p: Vec2, hitRadius = 20): BuilderSelection | null {
    const radiusSq = Math.max(0, hitRadius) * Math.max(0, hitRadius);
    let best = radiusSq;
    let colonyId = -1;
    for (const colony of this.currentSetup.colonies) {
      const dx = colony.nest.x - p.x;
      const dy = colony.nest.y - p.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= radiusSq && (colonyId < 0 || distanceSq < best)) {
        best = distanceSq;
        colonyId = colony.id;
      }
    }
    if (colonyId >= 0) {
      this.currentSelection = { kind: "colony", id: colonyId };
      return this.currentSelection;
    }

    best = radiusSq;
    let foodUid = -1;
    for (const source of this.currentSetup.food) {
      const dx = source.pos.x - p.x;
      const dy = source.pos.y - p.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= radiusSq && (foodUid < 0 || distanceSq < best)) {
        best = distanceSq;
        foodUid = source.uid;
      }
    }
    if (foodUid >= 0) {
      this.currentSelection = { kind: "food", id: foodUid };
      return this.currentSelection;
    }

    this.currentSelection = null;
    return null;
  }

  applyAt(p: Vec2): boolean {
    switch (this.currentTool) {
      case BuilderTool.Select:
        return this.selectAt(p) !== null;
      case BuilderTool.Colony: {
        const colony = addColony(
          this.currentSetup,
          p,
          this.nextColor === null ? undefined : this.nextColor,
          this.nextAnts,
        );
        if (colony === null) return false;
        this.currentSelection = { kind: "colony", id: colony.id };
        this.currentDirty = true;
        return true;
      }
      case BuilderTool.Food: {
        const food = addFood(this.currentSetup, p, this.nextFoodAmount, this.nextFoodKind);
        this.currentSelection = { kind: "food", id: food.uid };
        this.currentDirty = true;
        return true;
      }
      default:
        return this.paintAt(p);
    }
  }

  paintAt(p: Vec2): boolean {
    const kind = obstacleFor(this.currentTool);
    if (kind === null) return false;
    const changed = paintCells(this.currentSetup, kind, p, this.currentBrush) > 0;
    if (changed) this.currentDirty = true;
    return changed;
  }

  moveSelection(p: Vec2): boolean {
    const selection = this.currentSelection;
    if (selection === null) return false;
    const moved = selection.kind === "colony"
      ? moveColony(this.currentSetup, selection.id, p)
      : moveFood(this.currentSetup, selection.id, p);
    if (moved) this.currentDirty = true;
    return moved;
  }

  deleteSelection(): boolean {
    const selection = this.currentSelection;
    if (selection === null) return false;
    const removed = selection.kind === "colony"
      ? removeColony(this.currentSetup, selection.id)
      : removeFood(this.currentSetup, selection.id);
    if (!removed) return false;
    this.currentSelection = null;
    this.currentDirty = true;
    return true;
  }

  setSelectionColor(color: number): boolean {
    const selection = this.currentSelection;
    if (selection === null || selection.kind !== "colony") return false;
    if (!setColonyColor(this.currentSetup, selection.id, clampColor(color))) return false;
    this.currentDirty = true;
    return true;
  }

  setSelectionStartingAnts(count: number): boolean {
    const selection = this.currentSelection;
    if (selection === null || selection.kind !== "colony") return false;
    if (!setColonyStartingAnts(this.currentSetup, selection.id, clampStartingAnts(count))) return false;
    this.currentDirty = true;
    return true;
  }

  setSelectionFoodKind(kind: FoodKind): boolean {
    const selection = this.currentSelection;
    if (selection === null || selection.kind !== "food") return false;
    if (!setFoodKind(this.currentSetup, selection.id, clampKind(kind))) return false;
    this.currentDirty = true;
    return true;
  }

  setSelectionFoodAmount(amount: number): boolean {
    const selection = this.currentSelection;
    if (selection === null || selection.kind !== "food") return false;
    if (!setFoodAmount(this.currentSetup, selection.id, clampFoodAmount(amount))) return false;
    this.currentDirty = true;
    return true;
  }

  requestPreset(id: string): "loaded" | "confirm" | "unknown" {
    if (presetInfo(id) === null) return "unknown";
    if (this.currentDirty) {
      this.pending = id;
      return "confirm";
    }
    const loaded = loadPreset(id, this.currentSetup.seed);
    if (loaded === null) return "unknown";
    this.replaceSetup(loaded);
    return "loaded";
  }

  confirmPreset(): boolean {
    const id = this.pending;
    if (id === null) return false;
    const loaded = loadPreset(id, this.currentSetup.seed);
    this.pending = null;
    if (loaded === null) return false;
    this.replaceSetup(loaded);
    return true;
  }

  cancelPreset(): void {
    this.pending = null;
  }

  pendingPreset(): string | null {
    return this.pending;
  }

  private replaceSetup(next: WorldSetup): void {
    this.currentSetup = next;
    this.currentSelection = null;
    this.currentTool = BuilderTool.Select;
    this.currentDirty = false;
    this.pending = null;
    this.nextColor = null;
  }
}
