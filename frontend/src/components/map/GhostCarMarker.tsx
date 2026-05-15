import { CircleMarker, Tooltip } from 'react-leaflet';
import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import type { TelemetryRecord } from '../../types/telemetry';
import { detectLapCrossings, getCurrentLapInfo } from '../../lib/lapDetection';
import { pointAtTrackPosition, projectToTrack } from '../../lib/trackAnalytics';
import { hasValidGps } from '../../lib/gps';

function interpolateAtTimestamp(records: TelemetryRecord[], timestamp: number): [number, number] | null {
  const usable = records.filter(hasValidGps);
  if (usable.length === 0) return null;
  if (timestamp <= usable[0].timestamp) return [usable[0].latitude, usable[0].longitude];

  for (let i = 1; i < usable.length; i++) {
    const prev = usable[i - 1];
    const next = usable[i];
    if (timestamp <= next.timestamp) {
      const span = Math.max(1, next.timestamp - prev.timestamp);
      const t = (timestamp - prev.timestamp) / span;
      return [
        prev.latitude + (next.latitude - prev.latitude) * t,
        prev.longitude + (next.longitude - prev.longitude) * t,
      ];
    }
  }

  const last = usable[usable.length - 1];
  return [last.latitude, last.longitude];
}

export function GhostCarMarker() {
  const records = useTelemetryStore((s) => s.records);
  const laps = useTelemetryStore((s) => s.laps);

  const ghost = useMemo(() => {
    const latest = records[records.length - 1];
    if (!latest || !hasValidGps(latest)) return null;

    const crossings = detectLapCrossings(records);
    const currentLap = getCurrentLapInfo(records, crossings);
    const completed = laps.filter((lap) => lap.lapTimeMs !== null);
    const bestLap = completed.sort((a, b) => a.lapTimeMs! - b.lapTimeMs!)[0];

    if (currentLap && bestLap?.lapTimeMs) {
      const bestLapRecords = records.filter(
        (record) =>
          record.timestamp >= bestLap.startTimestamp &&
          bestLap.endTimestamp !== null &&
          record.timestamp <= bestLap.endTimestamp,
      );
      const elapsed = Math.min(currentLap.elapsedMs, bestLap.lapTimeMs);
      const position = interpolateAtTimestamp(bestLapRecords, bestLap.startTimestamp + elapsed);
      if (position) {
        return {
          position,
          label: `Best lap ghost · ${(elapsed / 1000).toFixed(1)}s`,
          color: '#f8fafc',
          fillColor: '#a855f7',
        };
      }
    }

    const projection = projectToTrack(latest.latitude, latest.longitude);
    return {
      position: pointAtTrackPosition(projection.trackPosition),
      label: 'Ideal route ghost',
      color: '#f8fafc',
      fillColor: '#38bdf8',
    };
  }, [records, laps]);

  if (!ghost) return null;

  return (
    <CircleMarker
      center={ghost.position}
      radius={7}
      pathOptions={{
        color: ghost.color,
        fillColor: ghost.fillColor,
        fillOpacity: 0.55,
        weight: 2,
        dashArray: '3 3',
      }}
    >
      <Tooltip permanent direction="right" offset={[8, 0]}>
        <span className="text-xs font-mono">{ghost.label}</span>
      </Tooltip>
    </CircleMarker>
  );
}
