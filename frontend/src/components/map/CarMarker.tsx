import { CircleMarker, Tooltip } from 'react-leaflet';
import { useTelemetryStore } from '../../store/telemetryStore';
import type { TelemetryRecord } from '../../types/telemetry';

interface CarMarkerProps {
  record?: TelemetryRecord;
  mode?: 'live' | 'replay';
}

export function CarMarker({ record, mode = 'live' }: CarMarkerProps) {
  const records = useTelemetryStore((s) => s.records);
  const latest = record ?? records[records.length - 1];

  if (!latest || latest.latitude === null || latest.longitude === null) return null;

  return (
    <CircleMarker
      center={[latest.latitude, latest.longitude]}
      radius={8}
      pathOptions={{
        color: '#fff',
        fillColor: mode === 'replay' ? '#facc15' : '#35fdad',
        fillOpacity: 1,
        weight: 2,
      }}
    >
      <Tooltip permanent direction="top" offset={[0, -10]}>
        <span className="text-xs font-mono">
          {mode === 'replay' ? 'Replay · ' : ''}
          {(latest.speed ?? 0).toFixed(0)} km/h
        </span>
      </Tooltip>
    </CircleMarker>
  );
}
