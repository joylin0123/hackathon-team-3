import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { computeRunSummaries, computeSensorHealth } from '../../lib/trackAnalytics';

function statusColor(status: string) {
  if (status === 'good') return 'text-[#35fdad]';
  if (status === 'watch') return 'text-yellow-300';
  return 'text-red-300';
}

export function DataConfidenceCard() {
  const records = useTelemetryStore((s) => s.records);
  const health = useMemo(() => computeSensorHealth(records), [records]);
  const runs = useMemo(() => computeRunSummaries(records), [records]);
  const bestRun = runs[0];

  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-3">
        Sensor Trust / Runs
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-white/40">Data confidence</div>
          <div className={`font-mono text-2xl ${statusColor(health.status)}`}>
            {health.confidenceScore.toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-white/40">Packet rate</div>
          <div className="font-mono text-2xl">{health.packetRateHz.toFixed(1)} Hz</div>
        </div>
        <div>
          <div className="text-white/40">GPS score</div>
          <div className="font-mono text-sm">{health.gpsScore.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-white/40">IMU score</div>
          <div className="font-mono text-sm">{health.imuScore.toFixed(0)}%</div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/10 text-xs">
        <div className="text-white/40">Best run</div>
        {bestRun ? (
          <div className="flex items-center justify-between gap-2 font-mono">
            <span>Session {bestRun.runId}</span>
            <span>{bestRun.topSpeed.toFixed(0)} km/h</span>
            <span>{bestRun.cleanScore.toFixed(0)} clean</span>
          </div>
        ) : (
          <div className="text-white/30 italic">Waiting for run data</div>
        )}
      </div>
    </div>
  );
}
