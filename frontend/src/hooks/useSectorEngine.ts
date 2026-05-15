import { useMemo } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { SectorEngine } from '../lib/SectorEngine';

/**
 * Live `SectorEngine` bound to the current telemetry store state. Rebuilt on
 * each new record batch — lap analysis inside the engine is lazy + cached,
 * so this is cheap.
 */
export function useSectorEngine(): SectorEngine {
  const records = useTelemetryStore((s) => s.records);
  const crossings = useTelemetryStore((s) => s.lapCrossings);
  const thresholds = useTelemetryStore((s) => s.sectorThresholds);
  return useMemo(
    () => new SectorEngine(records, crossings, thresholds),
    [records, crossings, thresholds],
  );
}
