export enum HeatmapMode {
  Off,
  DualChannel,
  ColonyColor,
}

export interface ViewSettings {
  heatmap: HeatmapMode;
  showAnts: boolean;
  showGrid: boolean;
  showHash: boolean;
  showColliders: boolean;
}

export function defaultViewSettings(): ViewSettings {
  return {
    heatmap: HeatmapMode.DualChannel,
    showAnts: true,
    showGrid: true,
    showHash: false,
    showColliders: false,
  };
}

export function cycleHeatmap(mode: HeatmapMode): HeatmapMode {
  const next = mode + 1;
  return next > HeatmapMode.ColonyColor ? HeatmapMode.Off : next;
}
