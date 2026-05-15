import { useDriverStateTape } from '../../hooks/useDriverStateTape';
import type { DrivingState } from '../../lib/CauseLocalizer';
import { STATE_COLOR } from '../../lib/driverStateOverlay';

const STATE_LETTER: Record<DrivingState, string> = {
  braking: 'B',
  cornering: 'C',
  full_throttle: 'F',
  coasting: 'O',
};

const STATE_FULL: Record<DrivingState, string> = {
  braking: 'Braking',
  cornering: 'Cornering',
  full_throttle: 'Full throttle',
  coasting: 'Coasting',
};

export function DriverStateTape() {
  const { now, baseline, transitions, baselineLapNumber, mismatchAtNow } = useDriverStateTape(40);

  const visibleTransitions = transitions.slice(-2);

  return (
    <div className="bg-white/5 rounded-lg p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">
          Driver state tape · last {now.length}s
          {mismatchAtNow && <span className="text-red-400"> · mismatch</span>}
        </div>
        <div className="flex items-center gap-3">
          {(['full_throttle', 'braking', 'cornering', 'coasting'] as DrivingState[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm border border-white/20"
                style={{ background: STATE_COLOR[s] }}
              />
              <span className="text-white/55 text-[10px] font-mono">
                {STATE_LETTER[s]} = {STATE_FULL[s]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col justify-center">
        {/* Transition labels with arrows */}
        <div className="relative h-5 mb-1">
          {visibleTransitions.map((tr) => {
            const leftPct = (tr.atIdx / now.length) * 100;
            return (
              <div
                key={`${tr.atIdx}-${tr.label}`}
                className="absolute -translate-x-1/2 text-[10px] font-mono text-white/80 whitespace-nowrap"
                style={{ left: `${leftPct}%` }}
              >
                {tr.label} ↓
              </div>
            );
          })}
        </div>

        {/* NOW row */}
        <Row cells={now} rowLabel="NOW" />

        {/* BASELINE row */}
        <Row
          cells={baseline}
          rowLabel={baselineLapNumber !== null ? `BASE L${baselineLapNumber}` : 'BASE —'}
          dim
        />

        {/* Time axis: oldest left, newest right */}
        <div className="flex justify-between text-[10px] font-mono text-white/40 mt-1 pl-14 pr-2">
          <span>−{now.length - 1}s</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  cells: ReturnType<typeof useDriverStateTape>['now'];
  rowLabel: string;
  dim?: boolean;
}

function Row({ cells, rowLabel, dim = false }: RowProps) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="text-white/50 text-[10px] font-mono uppercase tracking-widest w-12 shrink-0">
        {rowLabel}
      </div>
      <div className="flex gap-[2px] flex-1">
        {cells.map((c, i) => {
          const isNewest = i === cells.length - 1;
          if (c.state === null) {
            return (
              <div
                key={i}
                className="flex-1 aspect-square rounded-sm border border-white/10"
                style={{ minHeight: 0 }}
              />
            );
          }
          return (
            <div
              key={i}
              className="flex-1 aspect-square rounded-sm flex items-center justify-center text-[11px] font-mono font-bold text-black/85 border"
              style={{
                background: STATE_COLOR[c.state],
                opacity: dim ? 0.7 : 1,
                borderColor: isNewest ? '#ffffff' : 'rgba(0,0,0,0.15)',
              }}
              title={STATE_FULL[c.state]}
            >
              {STATE_LETTER[c.state]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
