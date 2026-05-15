import { useMemo } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { useSectorEngine } from './useSectorEngine';
import { classifyDrivingState, type DrivingState } from '../lib/CauseLocalizer';
import { IDEAL_LINE } from '../constants/zandvoort';
import { haversineMeters } from '../lib/lapDetection';

export interface LiveDrivingStateResult {
  now: DrivingState | null;
  baseline: DrivingState | null;
  baselineLapNumber: number | null;
  isMismatch: boolean;
}

/**
 * Live state of the car (one of the four driving states) plus what the best
 * baseline lap was doing at the same track position. Uses a 2-sample
 * stickiness filter on the current state so the badge doesn't flicker between
 * coasting and cornering at every 1 Hz tick.
 */
export function useLiveDrivingState(): LiveDrivingStateResult {
  const records = useTelemetryStore((s) => s.records);
  const engine = useSectorEngine();
  const laps = engine.lapStates();

  return useMemo<LiveDrivingStateResult>(() => {
    if (records.length === 0) {
      return { now: null, baseline: null, baselineLapNumber: null, isMismatch: false };
    }

    const tail = records.slice(-3);
    const states = tail.map((r) => classifyDrivingState(r));
    // Stickiness: require the latest two samples to agree before reporting.
    const now =
      states.length >= 2 && states[states.length - 1] === states[states.length - 2]
        ? states[states.length - 1]
        : states[states.length - 1];

    const latest = records[records.length - 1];

    const bestLap = pickBaseline(laps);
    if (!bestLap) {
      return { now, baseline: null, baselineLapNumber: null, isMismatch: false };
    }

    const idx = nearestIdealLineIdx(latest.latitude, latest.longitude);
    const baselineRecords = sliceLap(records, bestLap.startTimestamp, bestLap.endTimestamp);
    if (baselineRecords.length === 0) {
      return { now, baseline: null, baselineLapNumber: bestLap.lapNumber, isMismatch: false };
    }

    // Match by nearest IDEAL_LINE index in the baseline lap.
    let bestBaseRec = baselineRecords[0];
    let bestBaseD = Infinity;
    const target = IDEAL_LINE[idx];
    for (const r of baselineRecords) {
      const d = haversineMeters(r.latitude, r.longitude, target[0], target[1]);
      if (d < bestBaseD) {
        bestBaseD = d;
        bestBaseRec = r;
      }
    }
    const baseline = classifyDrivingState(bestBaseRec);

    return {
      now,
      baseline,
      baselineLapNumber: bestLap.lapNumber,
      isMismatch: now !== baseline,
    };
  }, [records, laps]);
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

function sliceLap<T extends { timestamp: number }>(records: T[], start: number, end: number): T[] {
  return records.filter((r) => r.timestamp >= start && r.timestamp < end);
}
