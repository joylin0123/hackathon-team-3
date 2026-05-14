import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { analyzeCornerCauses } from '../../lib/trackAnalytics';

function severityClass(severity: string) {
  if (severity === 'critical') return 'border-red-400/60 bg-red-500/10';
  if (severity === 'warning') return 'border-yellow-300/50 bg-yellow-400/10';
  return 'border-white/10 bg-white/5';
}

export function CornerCauseCards() {
  const records = useTelemetryStore((s) => s.records);
  const events = useMemo(() => analyzeCornerCauses(records).slice(0, 4), [records]);

  if (events.length === 0) {
    return (
      <div className="text-white/30 text-xs italic">
        No route-cause diagnostics yet. The analyzer will flag off-line, braking, yaw, and sensor-confidence events.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
      {events.map((event) => (
        <div key={event.id} className={`rounded border p-2 ${severityClass(event.severity)}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-white text-xs font-semibold">{event.corner}</div>
              <div className="text-[#35fdad] text-xs font-mono">{event.likelyCause}</div>
            </div>
            <div className="text-white/50 text-[10px] font-mono">{event.confidence}%</div>
          </div>
          <ul className="mt-2 space-y-1">
            {event.evidence.map((item) => (
              <li key={item} className="text-white/65 text-[11px]">- {item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
