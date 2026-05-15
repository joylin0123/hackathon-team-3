import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { IDEAL_LINE } from '../../constants/zandvoort';
import { IdealLinePath } from './IdealLinePath';
import { SpeedTrack } from './SpeedTrack';
import { CarMarker } from './CarMarker';
import { DeviationOverlay } from './DeviationOverlay';
import { GripHeatmap } from './GripHeatmap';
import { ZandvoortContextOverlay } from './ZandvoortContextOverlay';
import { GhostCarMarker } from './GhostCarMarker';
import { SectorOverlay } from './SectorOverlay';
import { CornerLabels } from './CornerLabels';
import { SectorBoundaryTicks } from './SectorBoundaryTicks';

// Fix broken default marker icons in Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
// @ts-expect-error private field
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, shadowUrl });

const ZANDVOORT_CENTER: [number, number] = [52.3881, 4.5462];

/**
 * Auto-fits the map to the full Zandvoort racing line on mount and on viewport
 * resize. Saves us from hand-tuning center/zoom for every layout change.
 */
function FitToTrack() {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(IDEAL_LINE.map(([lat, lon]) => L.latLng(lat, lon)));
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24] });
    };
    // First fit after the grid has actually laid out (Leaflet can mount into a
    // collapsing flex parent with 0 size).
    const id = window.setTimeout(fit, 0);
    const ro = new ResizeObserver(fit);
    ro.observe(map.getContainer());
    return () => {
      window.clearTimeout(id);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

// Speed legend entries
const LEGEND = [
  { label: 'Fast / clean', color: '#35fdad' },
  { label: 'Heavy braking', color: '#38bdf8' },
  { label: 'High lateral G', color: '#a855f7' },
  { label: 'Off-line', color: '#ef4444' },
];

interface RouteMapProps {
  minimal?: boolean;
}

export function RouteMap({ minimal = false }: RouteMapProps = {}) {
  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10 h-full">
      <MapContainer
        center={ZANDVOORT_CENTER}
        zoom={15}
        style={{ height: '100%', width: '100%', background: '#0a0a0a' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
          maxZoom={19}
        />
        <FitToTrack />
        {!minimal && <GripHeatmap />}
        <IdealLinePath />
        {!minimal && <SpeedTrack />}
        {!minimal && <DeviationOverlay />}
        {!minimal && <ZandvoortContextOverlay />}
        <SectorOverlay />
        <SectorBoundaryTicks />
        <CornerLabels />
        {!minimal && <GhostCarMarker />}
        <CarMarker />
      </MapContainer>

      {/* Legend */}
      {minimal ? (
        <div className="absolute bottom-4 left-4 z-[1000] bg-black/70 rounded p-2 text-xs text-white space-y-1">
          <div className="font-semibold mb-1">Zandvoort · 4.259 km</div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded" style={{ background: '#35fdad' }} />
            <span>S green</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded" style={{ background: '#facc15' }} />
            <span>S amber</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded" style={{ background: '#ef4444' }} />
            <span>S red</span>
          </div>
        </div>
      ) : (
      <div className="absolute bottom-4 left-4 z-[1000] bg-black/70 rounded p-2 text-xs text-white space-y-1">
        <div className="font-semibold mb-1">Zandvoort · 4.259 km</div>
        {LEGEND.map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-1 rounded" style={{ background: '#35fdad', borderTop: '2px dashed #35fdad' }} />
          <span>Ideal line</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 rounded bg-red-500" />
          <span>Off-line (&gt;8m)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-400 border border-white border-dashed" />
          <span>Ghost reference</span>
        </div>
      </div>
      )}
    </div>
  );
}
