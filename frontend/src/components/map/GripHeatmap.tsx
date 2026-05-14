import { Polyline, Tooltip } from 'react-leaflet';
import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { buildHeatmapBins, pointAtTrackPosition } from '../../lib/trackAnalytics';

function binColor(speed: number, lateralG: number, brakingG: number, deviationM: number) {
  if (deviationM > 8) return '#ef4444';
  if (brakingG > 0.35) return '#38bdf8';
  if (lateralG > 0.45) return '#a855f7';
  if (speed > 120) return '#35fdad';
  if (speed > 70) return '#facc15';
  return '#f97316';
}

export function GripHeatmap() {
  const records = useTelemetryStore((s) => s.records);
  const bins = useMemo(() => buildHeatmapBins(records, 64), [records]);

  if (records.length < 5) return null;

  return (
    <>
      {bins.filter((bin) => bin.sampleCount > 0).map((bin) => (
        <Polyline
          key={bin.index}
          positions={[
            pointAtTrackPosition(bin.startPosition),
            pointAtTrackPosition(bin.endPosition),
          ]}
          pathOptions={{
            color: binColor(bin.avgSpeed, bin.avgLateralG, bin.maxBrakingG, bin.avgDeviationM),
            weight: 8,
            opacity: 0.58,
            lineCap: 'round',
          }}
        >
          <Tooltip sticky>
            <div className="text-xs">
              <div className="font-semibold">Micro-sector {bin.index + 1}</div>
              <div>Avg speed {bin.avgSpeed.toFixed(0)} km/h</div>
              <div>Lat {bin.avgLateralG.toFixed(2)}g · Brake {bin.maxBrakingG.toFixed(2)}g</div>
              <div>Deviation {bin.avgDeviationM.toFixed(1)}m · {bin.sampleCount} samples</div>
            </div>
          </Tooltip>
        </Polyline>
      ))}
    </>
  );
}
