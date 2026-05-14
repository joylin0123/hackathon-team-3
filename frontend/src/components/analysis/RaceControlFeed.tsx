import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { analyzeCornerCauses, computeSensorHealth } from '../../lib/trackAnalytics';

function eventDot(severity: string) {
  if (severity === 'critical') return 'bg-red-400';
  if (severity === 'warning') return 'bg-yellow-300';
  return 'bg-[#35fdad]';
}

export function RaceControlFeed() {
  const records = useTelemetryStore((s) => s.records);
  const feed = useMemo(() => {
    const events = analyzeCornerCauses(records);
    const health = computeSensorHealth(records);
    const healthEvent = health.status === 'good'
      ? []
      : [{
          id: 'sensor-health',
          timestamp: records[records.length - 1]?.timestamp ?? Date.now(),
          severity: health.status === 'poor' ? 'critical' as const : 'warning' as const,
          title: 'Sensor confidence degraded',
          corner: 'Telemetry system',
          likelyCause: `${health.confidenceScore.toFixed(0)}% confidence`,
          evidence: [`GPS ${health.gpsScore.toFixed(0)}%`, `IMU ${health.imuScore.toFixed(0)}%`, `${health.dropoutCount} dropouts`],
        }];
    return [...healthEvent, ...events].slice(0, 8);
  }, [records]);

  if (feed.length === 0) {
    return <div className="text-white/30 text-xs italic">Race control feed is quiet.</div>;
  }

  return (
    <div className="space-y-2">
      {feed.map((event) => (
        <div key={event.id} className="flex gap-2 text-xs">
          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${eventDot(event.severity)}`} />
          <div>
            <div className="text-white/85">
              <span className="font-semibold">{event.title}</span>
              <span className="text-white/35"> · {event.corner}</span>
            </div>
            <div className="text-white/55">{event.likelyCause}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
