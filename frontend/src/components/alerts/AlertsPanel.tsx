import { useSectorAlerts } from '../../hooks/useSectorAlerts';
import type { Severity } from '../../lib/SectorEngine';

const SEV_COLORS: Record<Severity, string> = {
  none: '#475569',
  green: '#35fdad',
  amber: '#facc15',
  red: '#ef4444',
};

/**
 * Alerts feed — newest first. Replaces the dropped Slack notification path
 * (PRD demo step 4): the projector sees a new row pop when a red sector
 * lands, and console.warn mirrors via the store's pushAlert reducer.
 */
interface AlertsPanelProps {
  maxRows?: number;
}

export function AlertsPanel({ maxRows }: AlertsPanelProps = {}) {
  const all = useSectorAlerts();
  const alerts = maxRows !== undefined ? all.slice(0, maxRows) : all;

  return (
    <div className="bg-white/5 rounded-lg p-3 space-y-2">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">
        Alerts feed
      </div>
      {alerts.length === 0 ? (
        <div className="text-white/40 text-xs">Waiting for first anomaly…</div>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-auto">
          {alerts.map((a) => (
            <li
              key={`${a.lapNumber}-${a.sector}-${a.createdAt}`}
              className="flex items-start gap-2 border-l-2 pl-2"
              style={{ borderColor: SEV_COLORS[a.severity] }}
            >
              <div className="flex-1">
                <div className="text-white text-sm leading-tight">{a.headline}</div>
                <div className="text-white/50 text-[11px] font-mono">
                  L{a.lapNumber} · {a.sector.toUpperCase()} · {a.corner}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
