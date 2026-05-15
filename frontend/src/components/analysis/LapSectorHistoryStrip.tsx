import { useSectorEngine } from '../../hooks/useSectorEngine';
import { SECTORS, type Severity } from '../../lib/SectorEngine';

const COLORS: Record<Severity, string> = {
  none: '#475569',
  green: '#35fdad',
  amber: '#facc15',
  red: '#ef4444',
};

const MAX_LAPS_SHOWN = 7;

/**
 * 7 most recent laps × 3 sectors, colour-coded by severity. PRD demo step 5
 * reads off this strip: an engineer sees S2 deteriorating across three laps.
 */
interface LapSectorHistoryStripProps {
  compact?: boolean;
}

export function LapSectorHistoryStrip({ compact = false }: LapSectorHistoryStripProps = {}) {
  const engine = useSectorEngine();
  const laps = engine.lapStates();
  const recent = laps.slice(-MAX_LAPS_SHOWN);

  if (recent.length === 0) {
    return (
      <div className="text-white/40 text-xs font-mono">
        No completed laps yet — strip populates after the first lap.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">Lap history</div>
      <div className="flex gap-1">
        {/* Sector labels column */}
        <div className="flex flex-col justify-around text-[10px] text-white/40 font-mono pr-1">
          <div>S1</div>
          <div>S2</div>
          <div>S3</div>
        </div>
        {recent.map((lap) => (
          <div key={lap.lapNumber} className="flex flex-col gap-1 items-center">
            <div className="text-[10px] text-white/60 font-mono">L{lap.lapNumber}</div>
            {SECTORS.map((s) => {
              const t = lap[s];
              const ms = t.ms;
              const sec = ms !== null ? (ms / 1000).toFixed(2) : '—';
              return (
                <div
                  key={s}
                  className={
                    compact
                      ? 'w-7 h-5 rounded'
                      : 'w-12 h-8 rounded flex items-center justify-center text-[10px] font-mono text-black/80'
                  }
                  style={{ background: COLORS[t.severity] }}
                  title={`Lap ${lap.lapNumber} ${s.toUpperCase()}: ${sec}s (severity ${t.severity})`}
                >
                  {compact ? null : sec}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
