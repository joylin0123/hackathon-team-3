import { useLiveDrivingState } from '../../hooks/useLiveDrivingState';
import type { DrivingState } from '../../lib/CauseLocalizer';

const STATE_COLORS: Record<DrivingState, string> = {
  braking: '#ef4444',
  cornering: '#facc15',
  full_throttle: '#35fdad',
  coasting: '#94a3b8',
};

const STATE_LABEL: Record<DrivingState, string> = {
  braking: 'BRAKING',
  cornering: 'CORNERING',
  full_throttle: 'FULL THROTTLE',
  coasting: 'COASTING',
};

export function DrivingStateBadge() {
  const { now, baseline, baselineLapNumber, isMismatch } = useLiveDrivingState();

  if (!now) {
    return (
      <div className="bg-white/5 rounded-lg p-3">
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-1">
          Driver state
        </div>
        <div className="text-white/40 text-xs">Waiting for telemetry…</div>
      </div>
    );
  }

  return (
    <div
      className="bg-white/5 rounded-lg p-3 border"
      style={{ borderColor: isMismatch ? '#ef4444' : 'rgba(255,255,255,0.08)' }}
    >
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
        Driver state {isMismatch && <span className="text-red-400">· mismatch</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Pill label="NOW" state={now} />
        <Pill
          label={`BASELINE${baselineLapNumber !== null ? ` · L${baselineLapNumber}` : ''}`}
          state={baseline}
        />
      </div>
    </div>
  );
}

function Pill({ label, state }: { label: string; state: DrivingState | null }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-white/40 text-[10px] font-mono uppercase tracking-widest">{label}</div>
      <div
        className="px-2 py-1 rounded text-[11px] font-mono font-bold tracking-wide text-black text-center"
        style={{ background: state ? STATE_COLORS[state] : '#475569' }}
      >
        {state ? STATE_LABEL[state] : '—'}
      </div>
    </div>
  );
}
