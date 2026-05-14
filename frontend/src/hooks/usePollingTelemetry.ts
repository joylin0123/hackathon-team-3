import { useEffect } from 'react';
import { fetchTelemetry } from '../lib/api';
import { useTelemetryStore } from '../store/telemetryStore';

const POLL_INTERVAL_MS = 5000;

export function usePollingTelemetry() {
  const activeTeamId = useTelemetryStore((s) => s.activeTeamId);
  const isPolling = useTelemetryStore((s) => s.isPolling);
  const appendRecords = useTelemetryStore((s) => s.appendRecords);

  useEffect(() => {
    if (!isPolling || activeTeamId === null) return;

    async function poll() {
      // Read latestTimestamp directly from store state to always get freshest value
      const { latestTimestamp } = useTelemetryStore.getState();
      try {
        const records = await fetchTelemetry({
          team_id: activeTeamId!,
          since: latestTimestamp > 0 ? latestTimestamp + 1 : undefined,
          limit: 1000,
        });
        if (records.length > 0) {
          appendRecords(records);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeTeamId, isPolling, appendRecords]);
}
