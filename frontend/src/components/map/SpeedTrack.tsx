import { Polyline } from 'react-leaflet';
import { useTelemetryStore } from '../../store/telemetryStore';
import { speedToColor } from '../../lib/colorScale';

export function SpeedTrack() {
  const records = useTelemetryStore((s) => s.records);

  if (records.length < 2) return null;

  return (
    <>
      {records.slice(0, -1).map((r, i) => (
        <Polyline
          key={r.timestamp}
          positions={[
            [r.latitude, r.longitude],
            [records[i + 1].latitude, records[i + 1].longitude],
          ]}
          pathOptions={{ color: speedToColor(r.speed), weight: 3, opacity: 0.9 }}
        />
      ))}
    </>
  );
}
