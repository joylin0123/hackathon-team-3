import { useTelemetryStore } from '../../store/telemetryStore';

export function SpeedGauge() {
  const records = useTelemetryStore((s) => s.records);
  const latest = records[records.length - 1];
  const speed = latest?.speed ?? 0;
  const topSpeed = records.length > 0 ? Math.max(...records.map((r) => r.speed)) : 0;

  return (
    <div className="bg-white/5 rounded-lg p-4 flex flex-col items-center justify-center">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-1">Live Speed</div>
      <div className="text-6xl font-bold tabular-nums leading-none">{speed.toFixed(0)}</div>
      <div className="text-white/50 text-sm mt-1">km/h</div>
      <div className="mt-3 text-xs text-white/40">
        Session top: <span className="text-white/70 font-mono">{topSpeed.toFixed(0)} km/h</span>
      </div>
    </div>
  );
}
