import { useTelemetryStore } from '../../store/telemetryStore';
import { detectLapCrossings, getCurrentLapInfo } from '../../lib/lapDetection';

function formatMs(ms: number | null): string {
  if (ms === null) return '--:--.---';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function LapTimerCard() {
  const records = useTelemetryStore((s) => s.records);
  const laps = useTelemetryStore((s) => s.laps);
  const bestLapTimeMs = useTelemetryStore((s) => s.bestLapTimeMs);

  const crossings = detectLapCrossings(records);
  const current = getCurrentLapInfo(records, crossings);
  const lastLap = laps[laps.length - 1];
  const delta =
    current && bestLapTimeMs ? current.elapsedMs - bestLapTimeMs : null;

  return (
    <div className="bg-white/5 rounded-lg p-4 space-y-3">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">Lap Timer</div>

      <div>
        <div className="text-white/40 text-xs">Current lap</div>
        <div className="text-3xl font-mono tabular-nums">
          {formatMs(current?.elapsedMs ?? null)}
        </div>
        {delta !== null && (
          <div className={`text-sm font-mono ${delta > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {delta > 0 ? '+' : ''}{formatMs(Math.abs(delta))} vs best
          </div>
        )}
      </div>

      <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-white/40 text-xs">Best lap</div>
          <div className="font-mono">{formatMs(bestLapTimeMs)}</div>
        </div>
        <div>
          <div className="text-white/40 text-xs">Last lap</div>
          <div className="font-mono">{formatMs(lastLap?.lapTimeMs ?? null)}</div>
        </div>
        <div>
          <div className="text-white/40 text-xs">Lap #</div>
          <div className="font-mono">{crossings.length > 0 ? crossings.length : '--'}</div>
        </div>
        <div>
          <div className="text-white/40 text-xs">Completed laps</div>
          <div className="font-mono">{laps.length}</div>
        </div>
      </div>
    </div>
  );
}
