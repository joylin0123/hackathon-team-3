import { useEffect } from 'react';
import { fetchLiveTelemetry } from '../lib/api';
import { useTelemetryStore } from '../store/telemetryStore';

const POLL_INTERVAL_MS = 1000;
const FETCH_LIMIT = 10;

/**
 * Fast-path poller that hits the DynamoDB-backed `/api/live` endpoint at
 * ~1 Hz to keep the most recent few samples fresh. Runs alongside
 * `usePollingTelemetry` (5 s, Athena-backed) — that one fills the session
 * history; this one keeps the DriverStateTape, CarMarker, and live SectorOverlay
 * within ~1–2 s of real time. Dedup is automatic via the store's
 * `appendRecords` (filters timestamps ≤ latestTimestamp).
 *
 * Fails silently. If `/api/live` is unreachable (branch not deployed, CORS
 * issue, network hiccup) the dashboard degrades to whatever the slow poller
 * produces — never blank.
 */
export function useLiveTelemetry() {
  const activeTeamId = useTelemetryStore((s) => s.activeTeamId);
  const isPolling = useTelemetryStore((s) => s.isPolling);
  const appendRecords = useTelemetryStore((s) => s.appendRecords);

  useEffect(() => {
    if (!isPolling || activeTeamId === null) return;

    let cancelled = false;

    async function poll() {
      try {
        const records = await fetchLiveTelemetry(activeTeamId!, FETCH_LIMIT);
        if (cancelled || records.length === 0) return;
        // Endpoint returns newest-first; appendRecords sorts/dedups internally.
        appendRecords(records);
      } catch {
        // Silent. The 5 s Athena poller covers the gap; spamming console.error
        // every second on a missing endpoint just hides real errors.
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeTeamId, isPolling, appendRecords]);
}
