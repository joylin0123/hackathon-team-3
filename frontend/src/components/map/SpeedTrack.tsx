import { Polyline } from 'react-leaflet';
import { useTelemetryStore } from '../../store/telemetryStore';
import { speedToColor } from '../../lib/colorScale';
import { hasValidGps } from '../../lib/gps';

export function SpeedTrack() {
  const records = useTelemetryStore((s) => s.records);

  if (records.length < 2) return null;

  return (
    <>
      {records.slice(0, -1).map((r, i) => {
        const next = records[i + 1];
        if (!hasValidGps(r) || !hasValidGps(next)) return null;
        return (
          <Polyline
            key={r.timestamp}
            positions={[
              [r.latitude, r.longitude],
              [next.latitude, next.longitude],
            ]}
            pathOptions={{ color: speedToColor(r.speed ?? 0), weight: 3, opacity: 0.9 }}
          />
        );
      })}
    </>
  );
}
