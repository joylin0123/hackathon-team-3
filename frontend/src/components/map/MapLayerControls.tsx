import type { MapLayers } from './mapLayers';

interface MapLayerControlsProps {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
}

const OPTIONS: { key: keyof MapLayers; label: string }[] = [
  { key: 'heatmap', label: 'Heatmap' },
  { key: 'drivenRoute', label: 'Driven route' },
  { key: 'idealLine', label: 'Reference line' },
  { key: 'deviation', label: 'Off-line' },
  { key: 'corners', label: 'Corners' },
  { key: 'ghost', label: 'Ghost' },
  { key: 'driverState', label: 'Driver state' },
];

export function MapLayerControls({ layers, onChange }: MapLayerControlsProps) {
  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
        Map Layers
      </div>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => (
          <label key={option.key} className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={layers[option.key]}
              onChange={(event) => onChange({ ...layers, [option.key]: event.target.checked })}
              className="accent-[#35fdad]"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
