import { Polyline } from 'react-leaflet';
import { useTelemetryStore } from '../../store/telemetryStore';

const HIGH_DEVIATION_M = 8;

export function DeviationOverlay() {
  const records = useTelemetryStore((s) => s.records);
  const deviationPoints = useTelemetryStore((s) => s.deviationPoints);

  if (records.length < 2) return null;

  const segments: [number, number][][] = [];
  let current: [number, number][] = [];

  records.forEach((r, i) => {
    if (r.latitude === null || r.longitude === null) return;
    const dp = deviationPoints[i];
    if (dp && dp.distanceMeters > HIGH_DEVIATION_M) {
      current.push([r.latitude, r.longitude]);
    } else {
      if (current.length >= 2) segments.push(current);
      current = [];
    }
  });
  if (current.length >= 2) segments.push(current);

  return (
    <>
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg}
          pathOptions={{ color: '#ef4444', weight: 5, opacity: 0.7 }}
        />
      ))}
    </>
  );
}
