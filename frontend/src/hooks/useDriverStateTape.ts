import { useMemo } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { useSectorEngine } from './useSectorEngine';
import { classifyDrivingState, type DrivingState } from '../lib/CauseLocalizer';
import { IDEAL_LINE } from '../constants/zandvoort';
import { haversineMeters } from '../lib/lapDetection';

export interface TapeCell {
  state: DrivingState | null;
  /** Seconds before now (0 = newest, negative = older). null when slot is empty. */
  tOffsetSec: number | null;
}

export interface TapeTransition {
  /** Index in the `now` row where the new state begins. */
  atIdx: number;
  label: string;
}

export interface DriverStateTapeResult {
  now: TapeCell[];
  baseline: TapeCell[];
  transitions: TapeTransition[];
  baselineLapNumber: number | null;
  mismatchAtNow: boolean;
}

const TRANSITION_LABEL: Record<DrivingState, string> = {
  braking: 'brake_start',
  cornering: 'corner_start',
  full_throttle: 'throttle_start',
  coasting: 'coast_start',
};

/**
 * Builds the live driver-state queue. The `now` row is the last `windowSize`
 * telemetry records classified into one of four driving states. The
 * `baseline` row is the best prior lap's state at the *same track position*
 * (not the same time). Transitions are detected by walking pairs in `now`.
 */
export function useDriverStateTape(windowSize = 40): DriverStateTapeResult {
  const records = useTelemetryStore((s) => s.records);
  const engine = useSectorEngine();
  const laps = engine.lapStates();

  return useMemo<DriverStateTapeResult>(() => {
    const tail = records.slice(-windowSize);
    const nowOffsetBase = tail.length > 0 ? tail[tail.length - 1].timestamp : 0;

    const now: TapeCell[] = [];
    for (let i = 0; i < windowSize; i++) {
      const padding = windowSize - tail.length;
      if (i < padding) {
        now.push({ state: null, tOffsetSec: null });
      } else {
        const r = tail[i - padding];
        now.push({
          state: classifyDrivingState(r),
          tOffsetSec: Math.round((r.timestamp - nowOffsetBase) / 1000),
        });
      }
    }

    const transitions: TapeTransition[] = [];
    for (let i = 1; i < now.length; i++) {
      const prev = now[i - 1].state;
      const cur = now[i].state;
      if (prev !== null && cur !== null && prev !== cur) {
        transitions.push({ atIdx: i, label: TRANSITION_LABEL[cur] });
      }
    }

    const bestLap = pickBaseline(laps);
    const baseline: TapeCell[] = new Array(windowSize)
      .fill(null)
      .map(() => ({ state: null, tOffsetSec: null }));

    if (bestLap) {
      const baselineRecords = records.filter(
        (r) => r.timestamp >= bestLap.startTimestamp && r.timestamp < bestLap.endTimestamp,
      );
      if (baselineRecords.length > 0) {
        for (let i = 0; i < windowSize; i++) {
          const padding = windowSize - tail.length;
          if (i < padding) continue;
          const curRec = tail[i - padding];
          const idx = nearestIdealLineIdx(curRec.latitude, curRec.longitude);
          const target = IDEAL_LINE[idx];
          let bestRec = baselineRecords[0];
          let bestD = Infinity;
          for (const br of baselineRecords) {
            const d = haversineMeters(br.latitude, br.longitude, target[0], target[1]);
            if (d < bestD) {
              bestD = d;
              bestRec = br;
            }
          }
          baseline[i] = {
            state: classifyDrivingState(bestRec),
            tOffsetSec: null,
          };
        }
      }
    }

    const lastNow = now[now.length - 1].state;
    const lastBase = baseline[baseline.length - 1].state;
    const mismatchAtNow = lastNow !== null && lastBase !== null && lastNow !== lastBase;

    return {
      now,
      baseline,
      transitions,
      baselineLapNumber: bestLap?.lapNumber ?? null,
      mismatchAtNow,
    };
  }, [records, laps, windowSize]);
}

function pickBaseline<T extends { lapTimeMs: number }>(prior: T[]): T | null {
  if (prior.length === 0) return null;
  return prior.reduce((best, l) => (l.lapTimeMs < best.lapTimeMs ? l : best), prior[0]);
}

function nearestIdealLineIdx(lat: number, lon: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < IDEAL_LINE.length; i++) {
    const [iLat, iLon] = IDEAL_LINE[i];
    const d = haversineMeters(lat, lon, iLat, iLon);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
