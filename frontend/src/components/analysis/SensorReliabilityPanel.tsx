import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { computeRunSummaries, computeSensorHealth } from '../../lib/trackAnalytics';

export function SensorReliabilityPanel() {
  const records = useTelemetryStore((s) => s.records);
  const activeTeamId = useTelemetryStore((s) => s.activeTeamId);
  const health = useMemo(() => computeSensorHealth(records), [records]);
  const runs = useMemo(() => computeRunSummaries(records).slice(0, 3), [records]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <div className="bg-white/5 rounded p-2">
        <div className="text-white/40 text-xs mb-2">Active sensor</div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono">Sensor {activeTeamId ?? '-'}</span>
          <span className="font-mono text-[#35fdad]">{health.status.toUpperCase()}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-white/60">
          <div>Fresh {health.freshnessMs === null ? '-' : `${Math.round(health.freshnessMs / 1000)}s`}</div>
          <div>GPS {health.gpsScore.toFixed(0)}%</div>
          <div>Drops {health.dropoutCount}</div>
        </div>
      </div>

      <div className="bg-white/5 rounded p-2">
        <div className="text-white/40 text-xs mb-2">Run comparison</div>
        {runs.length === 0 ? (
          <div className="text-white/30 text-xs italic">No completed run data yet.</div>
        ) : (
          <div className="space-y-1">
            {runs.map((run) => (
              <div key={run.runId} className="grid grid-cols-4 gap-2 text-[11px] font-mono">
                <span>#{run.runId}</span>
                <span>{run.topSpeed.toFixed(0)} km/h</span>
                <span>{run.cleanScore.toFixed(0)} clean</span>
                <span>{run.confidenceScore.toFixed(0)} conf</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
