import { useMemo, useState } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { SpeedChart } from './SpeedChart';
import { LateralGChart } from './LateralGChart';
import { LongitudinalGChart } from './LongitudinalGChart';
import { YawRateChart } from './YawRateChart';

export interface ChartDataPoint {
  t: number;       // seconds since session start
  speed: number;
  latG: number;
  longG: number;
  yawRate: number;
}

export function TelemetryGraphs() {
  const records = useTelemetryStore((s) => s.records);
  const [brushStartIdx, setBrushStartIdx] = useState<number | undefined>(undefined);
  const [brushEndIdx, setBrushEndIdx] = useState<number | undefined>(undefined);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (records.length === 0) return [];
    const sessionStart = records[0].timestamp;
    return records.map((r) => ({
      t: Math.round((r.timestamp - sessionStart) / 1000),
      speed: Math.round((r.speed ?? 0) * 10) / 10,
      latG: Math.round(((r.acc_y ?? 0) / 9.81) * 100) / 100,
      longG: Math.round(((r.acc_x ?? 0) / 9.81) * 100) / 100,
      yawRate: Math.round((r.yaw_rate ?? 0) * 1000) / 1000,
    }));
  }, [records]);

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-white/30 text-sm">
        Waiting for telemetry data…
      </div>
    );
  }

  const brushProps = {
    data: chartData,
    brushStartIdx,
    brushEndIdx,
    onBrushChange: (start: number | undefined, end: number | undefined) => {
      setBrushStartIdx(start);
      setBrushEndIdx(end);
    },
  };

  return (
    <div className="flex flex-col gap-3">
      <SpeedChart {...brushProps} showBrush />
      <LateralGChart {...brushProps} />
      <LongitudinalGChart {...brushProps} />
      <YawRateChart {...brushProps} />
    </div>
  );
}
