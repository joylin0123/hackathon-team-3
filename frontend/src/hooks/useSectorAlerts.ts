import { useEffect, useMemo } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { useSectorEngine } from './useSectorEngine';
import { CauseLocalizer, lapNarrationKey, type NarrativeCard } from '../lib/CauseLocalizer';
import { SECTORS } from '../lib/SectorEngine';

/**
 * Side-effect hook: on every store update, walk the latest lap states. For
 * each amber/red sector that hasn't been narrated yet, run the
 * `CauseLocalizer` against the lap (with the rolling-best baseline lap) and
 * push the resulting card onto the alerts slice. The store dedupes via
 * `narratedLapKeys`. Red severity also fires console.warn from inside the
 * store's pushAlert reducer.
 */
export function useSectorAlerts(): NarrativeCard[] {
  const engine = useSectorEngine();
  const records = useTelemetryStore((s) => s.records);
  const alerts = useTelemetryStore((s) => s.alerts);
  const narratedLapKeys = useTelemetryStore((s) => s.narratedLapKeys);
  const pushAlert = useTelemetryStore((s) => s.pushAlert);
  const markLapNarrated = useTelemetryStore((s) => s.markLapNarrated);

  const localizer = useMemo(() => new CauseLocalizer(), []);

  useEffect(() => {
    const laps = engine.lapStates();
    if (laps.length === 0) return;

    // Baseline = the best (lowest total time) prior completed lap. Falls back
    // to the most recent prior lap if best can't be picked.
    for (let i = 1; i < laps.length; i++) {
      const lap = laps[i];
      const baseline = pickBaseline(laps.slice(0, i));
      for (const s of SECTORS) {
        const t = lap[s];
        if (t.severity !== 'amber' && t.severity !== 'red') continue;
        const key = `lap${lap.lapNumber}.${s}`;
        if (narratedLapKeys.has(key)) continue;
        const card = localizer.explain(lap, s, records, baseline);
        if (!card) continue;
        pushAlert(card);
        markLapNarrated(lapNarrationKey(card));
      }
    }
  }, [engine, records, narratedLapKeys, pushAlert, markLapNarrated, localizer]);

  return alerts;
}

function pickBaseline<T extends { lapTimeMs: number }>(prior: T[]): T | null {
  if (prior.length === 0) return null;
  return prior.reduce((best, l) => (l.lapTimeMs < best.lapTimeMs ? l : best), prior[0]);
}
