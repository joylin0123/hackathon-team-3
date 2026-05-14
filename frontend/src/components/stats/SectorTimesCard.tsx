import { useTelemetryStore } from '../../store/telemetryStore';

function formatMs(ms: number | null): string {
  if (ms === null) return '--:--.---';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function SectorTimesCard() {
  const laps = useTelemetryStore((s) => s.laps);
  const lastLap = laps[laps.length - 1];

  const bestS1 = laps.length > 0 ? Math.min(...laps.filter(l => l.sector1Ms).map(l => l.sector1Ms!)) : null;
  const bestS2 = laps.length > 0 ? Math.min(...laps.filter(l => l.sector2Ms).map(l => l.sector2Ms!)) : null;
  const bestS3 = laps.length > 0 ? Math.min(...laps.filter(l => l.sector3Ms).map(l => l.sector3Ms!)) : null;

  const sectors = [
    { label: 'S1', value: lastLap?.sector1Ms ?? null, best: bestS1 },
    { label: 'S2', value: lastLap?.sector2Ms ?? null, best: bestS2 },
    { label: 'S3', value: lastLap?.sector3Ms ?? null, best: bestS3 },
  ];

  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-3">Sector Times (last lap)</div>
      <div className="space-y-2">
        {sectors.map((s) => {
          const isBest = s.value !== null && s.best !== null && s.value <= s.best;
          return (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-white/50 text-sm w-6">{s.label}</span>
              <span className={`font-mono text-sm ${isBest ? 'text-purple-400' : 'text-white'}`}>
                {formatMs(s.value)}
              </span>
              <span className="text-white/30 font-mono text-xs">
                best {formatMs(s.best)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
