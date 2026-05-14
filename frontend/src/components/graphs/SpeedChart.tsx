import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Brush,
  ReferenceLine,
} from 'recharts';
import type { ChartDataPoint } from './TelemetryGraphs';

interface Props {
  data: ChartDataPoint[];
  brushStartIdx?: number;
  brushEndIdx?: number;
  onBrushChange: (start: number | undefined, end: number | undefined) => void;
  showBrush?: boolean;
}

export function SpeedChart({ data, brushStartIdx, brushEndIdx, onBrushChange, showBrush }: Props) {
  return (
    <div>
      <div className="text-[#35fdad] text-xs font-mono mb-1">Speed (km/h)</div>
      <div style={{ height: 90 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 0, right: 8, left: 0, bottom: showBrush ? 20 : 0 }}>
          <XAxis dataKey="t" tick={{ fill: '#ffffff40', fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
          <YAxis tick={{ fill: '#ffffff40', fontSize: 10 }} domain={[0, 220]} width={32} />
          <Tooltip
            contentStyle={{ background: '#003530', border: '1px solid #35fdad40', fontSize: 11 }}
            formatter={(v) => [`${(v as number).toFixed(1)} km/h`, 'Speed']}
            labelFormatter={(l) => `${l}s`}
          />
          <ReferenceLine y={0} stroke="#ffffff10" />
          <Line
            type="monotone"
            dataKey="speed"
            stroke="#35fdad"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          {showBrush && (
            <Brush
              dataKey="t"
              startIndex={brushStartIdx}
              endIndex={brushEndIdx}
              height={16}
              stroke="#35fdad40"
              fill="#003530"
              travellerWidth={6}
              onChange={(range) =>
                onBrushChange(
                  typeof range.startIndex === 'number' ? range.startIndex : undefined,
                  typeof range.endIndex === 'number' ? range.endIndex : undefined,
                )
              }
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
