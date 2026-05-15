import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';

export function SessionPicker() {
  const allRecords = useTelemetryStore((s) => s.allRecords);
  const records = useTelemetryStore((s) => s.records);
  const selectedSessionId = useTelemetryStore((s) => s.selectedSessionId);
  const setSelectedSession = useTelemetryStore((s) => s.setSelectedSession);

  const sessions = useMemo(() => {
    const grouped = new Map<number, { count: number; startedAt: number; endedAt: number }>();
    allRecords.forEach((record) => {
      const existing = grouped.get(record.session_id);
      grouped.set(record.session_id, {
        count: (existing?.count ?? 0) + 1,
        startedAt: Math.min(existing?.startedAt ?? record.timestamp, record.timestamp),
        endedAt: Math.max(existing?.endedAt ?? record.timestamp, record.timestamp),
      });
    });
    return Array.from(grouped.entries())
      .map(([id, meta]) => ({ id, ...meta }))
      .sort((a, b) => b.startedAt - a.startedAt);
  }, [allRecords]);

  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
        Session Picker
      </div>
      <select
        value={selectedSessionId ?? ''}
        onChange={(event) => setSelectedSession(event.target.value === '' ? null : Number(event.target.value))}
        className="w-full bg-white/10 border border-white/20 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-[#35fdad]"
      >
        <option value="">All loaded sessions</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            Session {session.id} · {session.count} samples
          </option>
        ))}
      </select>
      <div className="mt-2 text-[11px] text-white/45">
        Showing {records.length} samples for the active sensor
      </div>
    </div>
  );
}
