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
    heatmap: HeatmapMode.ColonyColor,
    showAnts: true,
    showGrid: false,
    showHash: false,
    showColliders: false,
  };
}

// M cycles Colonies → Trail type → Off → Colonies.
export function cycleHeatmap(mode: HeatmapMode): HeatmapMode {
  if (mode === HeatmapMode.ColonyColor) return HeatmapMode.DualChannel;
  if (mode === HeatmapMode.DualChannel) return HeatmapMode.Off;
  return HeatmapMode.ColonyColor;
}
