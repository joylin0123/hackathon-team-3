import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer } from 'react-leaflet';
import { IdealLinePath } from './IdealLinePath';
import { SpeedTrack } from './SpeedTrack';
import { CarMarker } from './CarMarker';
import { DeviationOverlay } from './DeviationOverlay';
import { GripHeatmap } from './GripHeatmap';
import { ZandvoortContextOverlay } from './ZandvoortContextOverlay';
import { GhostCarMarker } from './GhostCarMarker';
import { DEFAULT_MAP_LAYERS, type MapLayers } from './mapLayers';
import type { TelemetryRecord } from '../../types/telemetry';

// Fix broken default marker icons in Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
// @ts-expect-error private field
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, shadowUrl });

const ZANDVOORT_CENTER: [number, number] = [52.38815, 4.54655];

const LEGEND = [
  { label: 'Fast / clean', color: '#35fdad' },
  { label: 'Heavy braking', color: '#38bdf8' },
  { label: 'High lateral G', color: '#a855f7' },
  { label: 'Off-line', color: '#ef4444' },
];

interface RouteMapProps {
  layers?: MapLayers;
  replayRecord?: TelemetryRecord;
  compact?: boolean;
}

export function RouteMap({ layers = DEFAULT_MAP_LAYERS, replayRecord, compact = false }: RouteMapProps) {
  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10 h-full">
      <MapContainer
        center={ZANDVOORT_CENTER}
        zoom={compact ? 15 : 15}
        style={{ height: '100%', width: '100%', background: '#003530' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {layers.heatmap && <GripHeatmap />}
        {layers.idealLine && <IdealLinePath />}
        {layers.drivenRoute && <SpeedTrack />}
        {layers.deviation && <DeviationOverlay />}
        {layers.corners && <ZandvoortContextOverlay />}
        {layers.ghost && <GhostCarMarker />}
        <CarMarker record={replayRecord} mode={replayRecord ? 'replay' : 'live'} />
      </MapContainer>

      {/* Legend */}
      <div className={`absolute bottom-3 left-3 z-[1000] bg-black/70 rounded p-2 text-xs text-white space-y-1 ${compact ? 'max-w-[210px]' : ''}`}>
        <div className="font-semibold mb-1">Zandvoort · 4.259 km</div>
        {!compact && layers.heatmap && LEGEND.map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
        {layers.idealLine && <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-1 rounded" style={{ background: '#35fdad', borderTop: '2px dashed #35fdad' }} />
          <span>Reference line</span>
        </div>}
        {layers.deviation && <div className="flex items-center gap-2">
          <div className="w-3 h-1 rounded bg-red-500" />
          <span>Off-line (&gt;8m)</span>
        </div>}
        {layers.ghost && <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-400 border border-white border-dashed" />
          <span>Ghost reference</span>
        </div>}
        {replayRecord && <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-300 border border-white" />
          <span>Replay car</span>
        </div>}
      </div>
    </div>
  );
}
