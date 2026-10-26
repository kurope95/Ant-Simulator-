import { RingBuffer } from "../core/ring_buffer.js";
import type { Vec2 } from "../core/vec2.js";
import type { SimParams } from "./params.js";
import type { ColonyId } from "./types.js";

export interface Colony {
  id: ColonyId;
  nest: Vec2;
  color: number;
  foodPool: number;
  population: number;
  deliveredTotal: number;
  deliveredLastSample: number;
  deliveredPerSecond: RingBuffer<number>;
  // Observation only: sampled once a second, never read by the simulation.
  populationPerSecond: RingBuffer<number>;
  foodPoolPerSecond: RingBuffer<number>;
  extinct: boolean;
}

export function makeColony(id: ColonyId, nest: Vec2, color = 0, historyCapacity = 120): Colony {
  return {
    id,
    nest,
    color,
    foodPool: 0,
    population: 0,
    deliveredTotal: 0,
    deliveredLastSample: 0,
    deliveredPerSecond: new RingBuffer<number>(historyCapacity),
    populationPerSecond: new RingBuffer<number>(historyCapacity),
    foodPoolPerSecond: new RingBuffer<number>(historyCapacity),
    extinct: false,
  };
}

export function nestRadius(colony: Colony, params: SimParams): number {
  return params.nestBaseR + params.nestGrowth * Math.sqrt(colony.population);
}
