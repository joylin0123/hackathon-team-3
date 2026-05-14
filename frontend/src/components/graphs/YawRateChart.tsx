import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import type { ChartDataPoint } from './TelemetryGraphs';

interface Props {
  data: ChartDataPoint[];
  brushStartIdx?: number;
  brushEndIdx?: number;
  onBrushChange: (start: number | undefined, end: number | undefined) => void;
}

export function YawRateChart({ data, brushStartIdx, brushEndIdx }: Props) {
  const sliced =
    brushStartIdx !== undefined && brushEndIdx !== undefined
      ? data.slice(brushStartIdx, brushEndIdx + 1)
      : data;

  return (
    <div>
      <div className="text-purple-400 text-xs font-mono mb-1">Yaw Rate (rad/s)</div>
      <div style={{ height: 70 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sliced} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="t" tick={{ fill: '#ffffff40', fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
          <YAxis tick={{ fill: '#ffffff40', fontSize: 10 }} domain={[-2, 2]} width={32} />
          <Tooltip
            contentStyle={{ background: '#003530', border: '1px solid #a855f740', fontSize: 11 }}
            formatter={(v) => [`${(v as number).toFixed(3)} r/s`, 'Yaw Rate']}
            labelFormatter={(l) => `${l}s`}
          />
          <ReferenceLine y={0} stroke="#ffffff30" />
          <Line
            type="monotone"
            dataKey="yawRate"
            stroke="#a855f7"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
