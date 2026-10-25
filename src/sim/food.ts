import type { Vec2 } from "../core/vec2.js";
import type { SimParams } from "./params.js";

export interface FoodSource {
  pos: Vec2;
  amount: number;
  infinite: boolean;
}

export function foodRadius(source: FoodSource, params: SimParams): number {
  if (source.infinite) return params.foodBaseR * 2;
  return Math.max(params.foodMinR, params.foodBaseR * Math.sqrt(source.amount / params.foodRefAmount));
}

export interface FoodSources {
  items: FoodSource[];
  findTouching(pos: Vec2, radius: number, params: SimParams): number;
  takeOne(index: number): boolean;
  removeEmpty(): void;
}

export function makeFoodSources(): FoodSources {
  const sources: FoodSources = {
    items: [],
    findTouching(pos: Vec2, radius: number, params: SimParams): number {
      let best = -1;
      let bestDistSq = Infinity;
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
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
    takeOne(index: number): boolean {
      const item = this.items[index];
      if (item === undefined) return false;
      if (item.infinite) return true;
      if (item.amount <= 0) return false;
      item.amount -= 1;
      return true;
    },
    removeEmpty(): void {
      this.items = this.items.filter((source) => source.infinite || source.amount > 0);
    },
  };
  return sources;
}

export function addFoodSource(sources: FoodSources, pos: Vec2, amount: number, infinite = false): number {
  sources.items.push({ pos, amount, infinite });
  return sources.items.length - 1;
}
