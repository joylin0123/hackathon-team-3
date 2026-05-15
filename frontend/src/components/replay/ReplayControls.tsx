import type { TelemetryRecord } from '../../types/telemetry';

export interface ReplayState {
  enabled: boolean;
  playing: boolean;
  index: number;
  speed: number;
}

interface ReplayControlsProps {
  records: TelemetryRecord[];
  replay: ReplayState;
  onChange: (replay: ReplayState) => void;
}

function formatOffset(records: TelemetryRecord[], index: number) {
  if (records.length === 0) return '0.0s';
  const clamped = Math.max(0, Math.min(index, records.length - 1));
  const seconds = (records[clamped].timestamp - records[0].timestamp) / 1000;
  return `${seconds.toFixed(1)}s`;
}

export function ReplayControls({ records, replay, onChange }: ReplayControlsProps) {
  const maxIndex = Math.max(0, records.length - 1);
  const disabled = records.length < 2;
  const current = records[Math.min(replay.index, maxIndex)];

  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">
            Replay Mode
          </div>
          <p className="text-white/45 text-xs mt-1">
            Play back loaded telemetry for demos or post-run analysis.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            disabled={disabled}
            checked={replay.enabled}
            onChange={(event) => onChange({ ...replay, enabled: event.target.checked, playing: false, index: 0 })}
            className="accent-[#35fdad]"
          />
          Enable
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || !replay.enabled}
          onClick={() => onChange({ ...replay, playing: !replay.playing })}
          className="px-3 py-1.5 rounded bg-[#35fdad] disabled:bg-white/10 disabled:text-white/30 text-[#003530] text-xs font-mono"
        >
          {replay.playing ? 'Pause' : 'Play'}
        </button>
        <select
          value={replay.speed}
          disabled={disabled || !replay.enabled}
          onChange={(event) => onChange({ ...replay, speed: Number(event.target.value) })}
          className="bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs text-white"
        >
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
        </select>
        <div className="ml-auto text-xs font-mono text-white/60">
          {current ? `${formatOffset(records, replay.index)} · ${(current.speed ?? 0).toFixed(0)} km/h` : 'No data'}
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={maxIndex}
        value={Math.min(replay.index, maxIndex)}
        disabled={disabled || !replay.enabled}
        onChange={(event) => onChange({ ...replay, playing: false, index: Number(event.target.value) })}
        className="w-full mt-3 accent-[#35fdad]"
      />
    </div>
  );
}
