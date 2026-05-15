import { useTelemetryStore } from '../../store/telemetryStore';

/**
 * Two sliders controlling the green/amber/red boundaries. The PRD demo asks
 * the operator to drag these on stage and watch the lap-history strip
 * recompute live — so the bind must be reactive (Zustand). SectorEngine
 * picks the new values up via useSectorEngine on the next render.
 */
export function ThresholdSliders() {
  const thresholds = useTelemetryStore((s) => s.sectorThresholds);
  const set = useTelemetryStore((s) => s.setSectorThresholds);

  return (
    <div className="space-y-3">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">
        Severity thresholds
      </div>
      <Slider
        label="Amber"
        valuePct={thresholds.amberPct}
        max={0.05}
        onChange={(v) => set({ ...thresholds, amberPct: v })}
      />
      <Slider
        label="Red"
        valuePct={thresholds.redPct}
        max={0.1}
        onChange={(v) => set({ ...thresholds, redPct: v })}
      />
    </div>
  );
}

interface SliderProps {
  label: string;
  valuePct: number;
  max: number;
  onChange: (v: number) => void;
}

function Slider({ label, valuePct, max, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex justify-between text-[11px] font-mono">
        <span className="text-white/70">{label}</span>
        <span className="text-white">{(valuePct * 100).toFixed(1)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={0.001}
        value={valuePct}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
