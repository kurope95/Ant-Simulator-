import { fromAngle } from "../core/vec2.js";
import { nestRadius } from "./colony.js";
import { ContactKind, type ChunkEvents } from "./events.js";
import { emissionStrength, MarkerChannel } from "./marker_grid.js";
import { directSightHeading, explorerPattern, followerPattern, senseMarkers } from "./sensing.js";
import { turnToward, updateWander } from "./steering.js";
import { AntRole, AntState } from "./types.js";
import type { World } from "./world.js";

function senseChannel(state: number): MarkerChannel {
  return state === AntState.Foraging ? MarkerChannel.ToFood : MarkerChannel.ToHome;
}

function depositChannel(state: number): MarkerChannel | null {
  if (state === AntState.Foraging) return MarkerChannel.ToHome;
  if (state === AntState.ReturningFood) return MarkerChannel.ToFood;
  return null;
}

function chooseHeading(world: World, ant: number): { heading: number; bestFoodSignal: number } {
  const ants = world.ants;
  const state = ants.state[ant];
  const sight = directSightHeading(world, ant);
  if (sight !== null) {
    return { heading: sight, bestFoodSignal: state === AntState.Foraging ? 1 : 0 };
  }
  const usesExplorerPattern =
    ants.role[ant] === AntRole.Explorer && state !== AntState.ReturningExhausted;
  const pattern = usesExplorerPattern ? explorerPattern() : followerPattern();
  const sensed = senseMarkers(world, ant, senseChannel(state), pattern);
  return {
    heading: sensed.found ? sensed.targetHeading : ants.heading[ant],
    bestFoodSignal: sensed.bestFoodSignal,
  };
}

export function thinkChunk(world: World, begin: number, end: number, out: ChunkEvents): void {
  const ants = world.ants;
  const params = world.params;
  const dt = 1 / params.simHz;

  for (let ant = begin; ant < end; ant++) {
    ants.energy[ant] -= params.energyBurn * dt;
    ants.timeSinceAnchor[ant] += dt;
    ants.timeSinceLastMarker[ant] += dt;
    ants.degradeTimer[ant] = Math.max(0, ants.degradeTimer[ant] - dt);

    let chosen = chooseHeading(world, ant);
    let desired = chosen.heading;

    if (
      ants.state[ant] === AntState.Foraging &&
      ants.energy[ant] < params.exhaustedAt &&
      chosen.bestFoodSignal < params.pushOnSignal
    ) {
      ants.state[ant] = AntState.ReturningExhausted;
      chosen = chooseHeading(world, ant);
      desired = chosen.heading;
    }

    updateWander(world, ant, dt);
    desired += ants.wanderOffset[ant];

    ants.heading[ant] = turnToward(ants.heading[ant], desired, params.turnRate * dt);
    const direction = fromAngle(ants.heading[ant]);
    ants.velX[ant] = ants.speed[ant] * direction.x;
    ants.velY[ant] = ants.speed[ant] * direction.y;
    ants.prevX[ant] = ants.posX[ant];
    ants.prevY[ant] = ants.posY[ant];
    ants.posX[ant] += ants.velX[ant] * dt;
    ants.posY[ant] += ants.velY[ant] * dt;

    const dropDx = ants.posX[ant] - ants.dropX[ant];
    const dropDy = ants.posY[ant] - ants.dropY[ant];
    if (dropDx * dropDx + dropDy * dropDy >= params.markerDropDist * params.markerDropDist) {
      const cell = world.markers.cellIndex({ x: ants.posX[ant], y: ants.posY[ant] });
      const channel = depositChannel(ants.state[ant]);
      const strength = emissionStrength(ants.timeSinceAnchor[ant], params);
      if (channel !== null && cell >= 0 && strength >= params.markerEps) {
        out.deposits.push({ cell, colony: ants.colony[ant], channel, strength });
      }
      ants.dropX[ant] = ants.posX[ant];
      ants.dropY[ant] = ants.posY[ant];
      ants.timeSinceLastMarker[ant] = 0;
    }

    if (ants.degradeTimer[ant] > 0) {
      const cell = world.markers.cellIndex({ x: ants.posX[ant], y: ants.posY[ant] });
      if (cell !== ants.lastMarkerCell[ant]) {
        ants.lastMarkerCell[ant] = cell;
        if (cell >= 0 && world.markers.owner[cell] === ants.colony[ant]) {
          out.degrades.push({
            cell,
            colony: ants.colony[ant],
            channel: senseChannel(ants.state[ant]),
          });
        }
      }
    }

    const foodIndex = world.food.findTouching(
      { x: ants.posX[ant], y: ants.posY[ant] },
      params.antRadius,
      params,
    );
    if (foodIndex >= 0) {
      out.contacts.push({ antIndex: ant, kind: ContactKind.Food, target: foodIndex });
    }

    const colony = world.colonies[ants.colony[ant]];
    if (colony !== undefined) {
      const dx = ants.posX[ant] - colony.nest.x;
      const dy = ants.posY[ant] - colony.nest.y;
      const reach = nestRadius(colony, params) + params.antRadius;
      if (dx * dx + dy * dy <= reach * reach) {
        out.contacts.push({ antIndex: ant, kind: ContactKind.Nest, target: colony.id });
      }
    }
  }
}
