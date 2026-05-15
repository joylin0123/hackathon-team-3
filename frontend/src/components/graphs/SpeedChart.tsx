import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Brush,
  ReferenceLine,
} from 'recharts';
import { useMemo } from 'react';
import type { ChartDataPoint } from './TelemetryGraphs';

interface Props {
  data: ChartDataPoint[];
  brushStartIdx?: number;
  brushEndIdx?: number;
  onBrushChange: (start: number | undefined, end: number | undefined) => void;
  showBrush?: boolean;
  chartHeight?: number;
}

const SPEED_COLOR = '#fbbf24';
const LAT_G_COLOR = '#35fdad';
const LONG_G_COLOR = '#a855f7';

function smooth<K extends keyof ChartDataPoint>(data: ChartDataPoint[], key: K, window = 5): ChartDataPoint[] {
  if (data.length === 0) return data;
  const half = Math.floor(window / 2);
  return data.map((d, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(data.length - 1, i + half); j++) {
      const v = data[j][key];
      if (typeof v === 'number') {
        sum += v;
        n++;
      }
    }
    return { ...d, [key]: n > 0 ? Math.round((sum / n) * 1000) / 1000 : d[key] };
  });
}

export function SpeedChart({ data, brushStartIdx, brushEndIdx, onBrushChange, showBrush, chartHeight = 110 }: Props) {
  const smoothed = useMemo(() => {
    if (data.length === 0) return data;
    let d = smooth(data, 'speed', 5);
    d = smooth(d, 'latG', 5);
    d = smooth(d, 'longG', 5);
    return d;
  }, [data]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[#35fdad] text-xs font-mono">Speed + G-force</div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <Legend swatch={SPEED_COLOR} label="Speed" />
          <Legend swatch={LAT_G_COLOR} label="Lat G" />
          <Legend swatch={LONG_G_COLOR} label="Long G" />
        </div>
      </div>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={smoothed} margin={{ top: 0, right: 8, left: 0, bottom: showBrush ? 20 : 0 }}>
            <XAxis
              dataKey="t"
              tick={{ fill: '#ffffff40', fontSize: 10 }}
              tickFormatter={(v) => `${v}s`}
            />
            <YAxis
              yAxisId="speed"
              tick={{ fill: '#fbbf2480', fontSize: 10 }}
              domain={[0, 220]}
              width={32}
            />
            <YAxis
              yAxisId="g"
              orientation="right"
              tick={{ fill: '#ffffff60', fontSize: 10 }}
              domain={[-3, 3]}
              width={28}
              tickFormatter={(v) => `${v}g`}
            />
            <ReferenceLine yAxisId="g" y={0} stroke="#ffffff15" />
            <Tooltip
              contentStyle={{ background: '#003530', border: '1px solid #35fdad40', fontSize: 11 }}
              labelFormatter={(l) => `${l}s`}
              formatter={(v, name) => {
                if (name === 'speed') return [`${(v as number).toFixed(1)} km/h`, 'Speed'];
                if (name === 'latG') return [`${(v as number).toFixed(2)} g`, 'Lat G'];
                if (name === 'longG') return [`${(v as number).toFixed(2)} g`, 'Long G'];
                return [v, name];
              }}
            />
            <Line
              yAxisId="speed"
              type="monotone"
              dataKey="speed"
              stroke={SPEED_COLOR}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              yAxisId="g"
              type="monotone"
              dataKey="latG"
              stroke={LAT_G_COLOR}
              dot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Line
              yAxisId="g"
              type="monotone"
              dataKey="longG"
              stroke={LONG_G_COLOR}
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2.5 h-0.5 rounded" style={{ background: swatch }} />
      <span className="text-white/55">{label}</span>
    </div>
  );
}
