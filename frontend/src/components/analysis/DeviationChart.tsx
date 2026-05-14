import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';

export function DeviationChart() {
  const deviationPoints = useTelemetryStore((s) => s.deviationPoints);

  const chartData = useMemo(
    () =>
      deviationPoints.map((dp) => ({
        pos: Math.round(dp.trackPosition * 100),
        dist: Math.round(dp.distanceMeters * 10) / 10,
      })),
    [deviationPoints],
  );

  if (chartData.length === 0) {
    return <div className="text-white/30 text-xs italic">No data yet</div>;
  }

  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="devGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="pos"
            tick={{ fill: '#ffffff40', fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            tick={{ fill: '#ffffff40', fontSize: 10 }}
            domain={[0, 'auto']}
            width={28}
            tickFormatter={(v) => `${v}m`}
          />
          <Tooltip
            contentStyle={{ background: '#003530', border: '1px solid #ef444440', fontSize: 11 }}
            formatter={(v) => [`${(v as number).toFixed(1)}m`, 'Deviation']}
            labelFormatter={(l) => `${l}% of lap`}
          />
          <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: '8m', fill: '#ef4444', fontSize: 9 }} />
          <ReferenceLine y={3} stroke="#facc15" strokeDasharray="4 2" strokeOpacity={0.4} label={{ value: '3m', fill: '#facc15', fontSize: 9 }} />
          <Area
            type="monotone"
            dataKey="dist"
            stroke="#ef4444"
            strokeWidth={1.5}
            fill="url(#devGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
