import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { generateInsights } from '../../lib/deviation';

export function InsightsList() {
  const records = useTelemetryStore((s) => s.records);
  const deviationPoints = useTelemetryStore((s) => s.deviationPoints);

  const insights = useMemo(
    () => generateInsights(records, deviationPoints),
    [records, deviationPoints],
  );

  if (insights.length === 0) {
    return (
      <div className="text-white/30 text-xs italic">
        No significant deviations detected yet. Keep driving!
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {insights.map((insight, i) => (
        <li key={i} className="flex gap-2 text-xs">
          <span className="text-red-400 mt-0.5 shrink-0">▶</span>
          <span className="text-white/80">{insight}</span>
        </li>
      ))}
    </ul>
  );
}
