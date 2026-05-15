export interface MapLayers {
  heatmap: boolean;
  idealLine: boolean;
  drivenRoute: boolean;
  deviation: boolean;
  corners: boolean;
  ghost: boolean;
}

export const DEFAULT_MAP_LAYERS: MapLayers = {
  heatmap: true,
  idealLine: true,
  drivenRoute: true,
  deviation: true,
  corners: true,
  ghost: true,
};
