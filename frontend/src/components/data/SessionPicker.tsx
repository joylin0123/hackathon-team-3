import { useEffect, useMemo, useState } from 'react';
import { fetchSessions, fetchTelemetry } from '../../lib/api';
import { useTelemetryStore } from '../../store/telemetryStore';
import type { SessionSummary } from '../../types/telemetry';

export function SessionPicker() {
  const allRecords = useTelemetryStore((s) => s.allRecords);
  const records = useTelemetryStore((s) => s.records);
  const activeTeamId = useTelemetryStore((s) => s.activeTeamId);
  const selectedSessionId = useTelemetryStore((s) => s.selectedSessionId);
  const setSelectedSession = useTelemetryStore((s) => s.setSelectedSession);
  const appendRecords = useTelemetryStore((s) => s.appendRecords);
  const [remoteSessions, setRemoteSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setIsLoadingSessions(true);
      setLoadError(null);
      try {
        const sessions = await fetchSessions(activeTeamId ?? undefined);
        if (!cancelled) setRemoteSessions(sessions);
      } catch (err) {
        console.error('Session load error:', err);
        if (!cancelled) setLoadError('Could not load session list');
      } finally {
        if (!cancelled) setIsLoadingSessions(false);
      }
    }

    loadSessions();
    return () => {
      cancelled = true;
    };
  }, [activeTeamId]);

  const loadedSessions = useMemo(() => {
    const grouped = new Map<number, { count: number; startedAt: number; endedAt: number }>();
    allRecords.forEach((record) => {
      if (activeTeamId !== null && record.team_id !== activeTeamId) return;
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
  }, [activeTeamId, allRecords]);

  const sessions = useMemo(() => {
    const loadedById = new Map(loadedSessions.map((session) => [session.id, session]));
    const merged = new Map<number, {
      id: number;
      count: number;
      loadedCount: number;
      startedAt: number;
      endedAt: number;
    }>();

    remoteSessions.forEach((session) => {
      const loaded = loadedById.get(session.session_id);
      merged.set(session.session_id, {
        id: session.session_id,
        count: session.sample_count,
        loadedCount: loaded?.count ?? 0,
        startedAt: session.started_at,
        endedAt: session.ended_at,
      });
    });

    loadedSessions.forEach((session) => {
      const existing = merged.get(session.id);
      merged.set(session.id, {
        id: session.id,
        count: existing?.count ?? session.count,
        loadedCount: session.count,
        startedAt: existing?.startedAt ?? session.startedAt,
        endedAt: existing?.endedAt ?? session.endedAt,
      });
    });

    return Array.from(merged.values()).sort((a, b) => b.endedAt - a.endedAt);
  }, [loadedSessions, remoteSessions]);

  async function handleSessionChange(value: string) {
    const nextSessionId = value === '' ? null : Number(value);
    setLoadError(null);
    setSelectedSession(nextSessionId);

    if (nextSessionId === null || activeTeamId === null) return;

    setIsLoadingTelemetry(true);
    try {
      const sessionRecords = await fetchTelemetry({
        team_id: activeTeamId,
        session_id: nextSessionId,
        limit: 5000,
      });
      appendRecords(sessionRecords);
      setSelectedSession(nextSessionId);
    } catch (err) {
      console.error('Session telemetry load error:', err);
      setLoadError('Could not load selected session');
    } finally {
      setIsLoadingTelemetry(false);
    }
  }

  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
        Session Picker
      </div>
      <select
        value={selectedSessionId ?? ''}
        onChange={(event) => handleSessionChange(event.target.value)}
        disabled={isLoadingTelemetry}
        className="w-full bg-white/10 border border-white/20 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-[#35fdad]"
      >
        <option value="">All loaded sessions</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            Session {session.id} · {session.loadedCount || session.count}/{session.count} samples
          </option>
        ))}
      </select>
      <div className="mt-2 text-[11px] text-white/45">
        {isLoadingTelemetry
          ? 'Loading selected session telemetry…'
          : isLoadingSessions
            ? 'Loading available sessions…'
            : `Showing ${records.length} samples for the active sensor`}
      </div>
      {loadError && <div className="mt-1 text-[11px] text-red-300">{loadError}</div>}
    </div>
  );
}
