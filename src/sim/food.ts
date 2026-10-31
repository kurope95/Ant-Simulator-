import type { Vec2 } from "../core/vec2.js";
import type { SimParams } from "./params.js";
import { FoodKind } from "./setup.js";

export interface FoodAmount {
  pos: Vec2;
  amount: number;
  infinite: boolean;
}

export interface FoodSource extends FoodAmount {
  uid: number;
  kind: FoodKind;
  // The most a living pile grows to (its starting amount); 0 never grows.
  capacity?: number;
  // Seconds a pile that was eaten to the last piece still lingers, bare, so
  // ants arriving on its trail find it empty; it never grows again.
  deadFor?: number;
}

// Seconds a dead pile lingers before it is removed.
export const kDeadPileLinger = 60;

export function foodRadius(source: FoodAmount, params: SimParams): number {
  if (source.infinite) return params.foodBaseR * 2;
  return Math.max(params.foodMinR, params.foodBaseR * Math.sqrt(source.amount / params.foodRefAmount));
}

export interface FoodSources {
  items: FoodSource[];
  nextUid: number;
  findTouching(pos: Vec2, radius: number, params: SimParams): number;
  // A regrowing pile with under one piece left that the point touches, or -1.
  findBareTouching(pos: Vec2, radius: number, params: SimParams): number;
  takeOne(index: number): boolean;
  removeEmpty(): void;
  // Grows every living pile like a population (spec §4.4): by ratePerMinute of
  // its own size, slowing to nothing at its capacity. A dead pile never grows.
  regrow(dt: number, ratePerMinute: number): void;
  // Food eaten off a pile; eating it to under one piece kills the pile.
  eat(index: number, amount: number): void;
}

export function makeFoodSources(): FoodSources {
  const sources: FoodSources = {
    items: [],
    nextUid: 1,
    findTouching(pos: Vec2, radius: number, params: SimParams): number {
      let best = -1;
      let bestDistSq = Infinity;
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        // A pile with less than one piece left is bare ground until it regrows.
        if (!item.infinite && item.amount < 1) continue;
        const dx = item.pos.x - pos.x;
        const dy = item.pos.y - pos.y;
        const distSq = dx * dx + dy * dy;
        const reach = foodRadius(item, params) + radius;
        if (distSq <= reach * reach && distSq < bestDistSq) {
          best = i;
          bestDistSq = distSq;
        }
      }
      return best;
    },
    findBareTouching(pos: Vec2, radius: number, params: SimParams): number {
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        if (item.infinite || item.amount >= 1) continue;
        const dx = item.pos.x - pos.x;
        const dy = item.pos.y - pos.y;
        const reach = foodRadius(item, params) + radius;
        if (dx * dx + dy * dy <= reach * reach) return i;
      }
      return -1;
    },
    takeOne(index: number): boolean {
      const item = this.items[index];
      if (item === undefined) return false;
      if (item.infinite) return true;
      if (item.amount < 1) return false;
      item.amount -= 1;
      if (item.amount < 1) killPile(item);
      return true;
    },
    eat(index: number, amount: number): void {
      const item = this.items[index];
      if (item === undefined || item.infinite || !(amount > 0)) return;
      item.amount = Math.max(0, item.amount - amount);
      if (item.amount < 1) killPile(item);
    },
    removeEmpty(): void {
      // A dead pile lingers, bare, for kDeadPileLinger s; then it is gone.
      this.items = this.items.filter(
        (source) => source.infinite || source.amount >= 1 || (source.deadFor ?? Infinity) < kDeadPileLinger,
      );
    },
    regrow(dt: number, ratePerMinute: number): void {
      for (const item of this.items) {
        if (item.deadFor !== undefined) {
          item.deadFor += dt;
          continue;
        }
        const capacity = item.capacity ?? 0;
        if (!(ratePerMinute > 0) || item.infinite || capacity <= 0 || item.amount >= capacity) continue;
        // Logistic growth: the less there is, the less it adds; nothing past capacity.
        const growth = (ratePerMinute / 60) * item.amount * (1 - item.amount / capacity) * dt;
        item.amount = Math.min(capacity, item.amount + growth);
      }
    },
  };
  return sources;
}

// The last piece is gone: a living patch is dead and never grows again; it
// lingers bare for a while. A pile that never grew is simply removed.
function killPile(item: FoodSource): void {
  item.amount = 0;
  if ((item.capacity ?? 0) > 0 && item.deadFor === undefined) item.deadFor = 0;
}

export function addFoodSource(
  sources: FoodSources,
  pos: Vec2,
  amount: number,
  infinite = false,
  kind: FoodKind = FoodKind.Seeds,
): number {
  sources.items.push({ uid: sources.nextUid++, pos, amount, infinite, kind });
  return sources.items.length - 1;
}
