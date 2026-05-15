import { useSectorAlerts } from '../../hooks/useSectorAlerts';
import type { Severity } from '../../lib/SectorEngine';

const SEV_COLORS: Record<Severity, string> = {
  none: '#475569',
  green: '#35fdad',
  amber: '#facc15',
  red: '#ef4444',
};

const SEV_BG: Record<Severity, string> = {
  none: 'rgba(71,85,105,0.15)',
  green: 'rgba(53,253,173,0.10)',
  amber: 'rgba(250,204,21,0.10)',
  red: 'rgba(239,68,68,0.12)',
};

interface SectorInsightCardProps {
  hero?: boolean;
}

export function SectorInsightCard({ hero = false }: SectorInsightCardProps = {}) {
  const alerts = useSectorAlerts();
  const latest = alerts[0];

  if (!latest) {
    return (
      <div className="bg-white/5 rounded-lg p-4">
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
          Sector Insight
        </div>
        <div className="text-white/60 text-sm">All sectors green — no anomaly to report.</div>
      </div>
    );
  }

  if (hero) {
    return (
      <div
        className="rounded-lg p-5 border"
        style={{
          background: SEV_BG[latest.severity],
          borderColor: SEV_COLORS[latest.severity],
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="px-2 py-0.5 rounded text-[11px] font-mono font-bold tracking-widest text-black"
            style={{ background: SEV_COLORS[latest.severity] }}
          >
            {latest.severity.toUpperCase()}
          </span>
          <span className="text-white/70 text-[11px] font-mono uppercase tracking-widest">
            Action · Lap {latest.lapNumber} · {latest.sector.toUpperCase()}
          </span>
        </div>
        <div className="text-white text-2xl leading-tight font-bold mb-3">
          {latest.advice}
        </div>
        <div className="border-t border-white/10 pt-2 mb-2">
          <div className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-1">Why</div>
          <div className="text-white/85 text-sm leading-snug">{latest.headline}</div>
          <div className="text-white/55 text-xs leading-snug mt-1">{latest.supporting}</div>
        </div>
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">
          {latest.corner}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: SEV_COLORS[latest.severity] }}
        />
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">
          Sector Insight · Lap {latest.lapNumber} · {latest.sector.toUpperCase()}
        </div>
      </div>
      <div className="text-white text-base font-semibold leading-snug mb-1">{latest.advice}</div>
      <div className="text-white/75 text-sm mb-1">{latest.headline}</div>
      <div className="text-white/55 text-xs mb-2">{latest.supporting}</div>
      <div className="text-white/40 text-[11px] font-mono">{latest.corner}</div>
    </div>
  );
}
