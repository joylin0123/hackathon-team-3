import { CircleMarker, Tooltip } from 'react-leaflet';
import { useTelemetryStore } from '../../store/telemetryStore';

export function CarMarker() {
  const records = useTelemetryStore((s) => s.records);
  const latest = records[records.length - 1];

  if (!latest || latest.latitude === null || latest.longitude === null) return null;

  return (
    <CircleMarker
      center={[latest.latitude, latest.longitude]}
      radius={8}
      pathOptions={{ color: '#fff', fillColor: '#35fdad', fillOpacity: 1, weight: 2 }}
    >
      <Tooltip permanent direction="top" offset={[0, -10]}>
        <span className="text-xs font-mono">
          {(latest.speed ?? 0).toFixed(0)} km/h
        </span>
      </Tooltip>
    </CircleMarker>
  );
}
