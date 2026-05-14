import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer } from 'react-leaflet';
import { IdealLinePath } from './IdealLinePath';
import { SpeedTrack } from './SpeedTrack';
import { CarMarker } from './CarMarker';
import { DeviationOverlay } from './DeviationOverlay';

// Fix broken default marker icons in Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
// @ts-expect-error private field
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, shadowUrl });

const ZANDVOORT_CENTER: [number, number] = [52.3876, 4.5397];

// Speed legend entries
const LEGEND = [
  { label: '0 km/h', color: 'rgb(220,0,0)' },
  { label: '100 km/h', color: 'rgb(220,200,0)' },
  { label: '200 km/h', color: 'rgb(0,200,0)' },
];

export function RouteMap() {
  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10 h-full">
      <MapContainer
        center={ZANDVOORT_CENTER}
        zoom={15}
        style={{ height: '100%', width: '100%', background: '#003530' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <IdealLinePath />
        <SpeedTrack />
        <DeviationOverlay />
        <CarMarker />
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-black/70 rounded p-2 text-xs text-white space-y-1">
        <div className="font-semibold mb-1">Speed</div>
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
      </div>
    </div>
  );
}
