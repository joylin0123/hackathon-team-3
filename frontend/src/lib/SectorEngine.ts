import {
  IDEAL_LINE,
  SECTOR_BOUNDARIES,
  START_FINISH,
  START_FINISH_RADIUS_M,
} from '../constants/zandvoort';
import type { TelemetryRecord } from '../types/telemetry';
import { haversineMeters } from './lapDetection';

/**
 * Sector identifier — three FIA-style sectors for Circuit Zandvoort.
 */
export type Sector = 's1' | 's2' | 's3';
export const SECTORS: Sector[] = ['s1', 's2', 's3'];

/**
 * Severity tag for a sector's lap time vs the rolling baseline.
 * Stubs: `none` is used when there's no baseline yet (warm-up laps).
 */
export type Severity = 'none' | 'green' | 'amber' | 'red';

export interface SectorThresholds {
  /** Sector times within +amberPct of baseline are green. e.g. 0.01 = 1% */
  amberPct: number;
  /** Sector times beyond +redPct of baseline are red. e.g. 0.03 = 3% */
  redPct: number;
}

export const DEFAULT_THRESHOLDS: SectorThresholds = {
  amberPct: 0.01,
  redPct: 0.03,
};

export interface SectorTimings {
  /** Wall-clock ms spent in this sector on this lap, or null if unmeasurable. */
  ms: number | null;
  /** Severity classification vs baseline; `none` until a baseline exists. */
  severity: Severity;
  /** Rolling-best baseline ms used to classify this sector on this lap. */
  baselineMs: number | null;
  /** Sample-index window [start,end) inside the lap's records. */
  startIdx: number;
  endIdx: number;
}

export interface LapSectorState {
  lapNumber: number;
  startTimestamp: number;
  endTimestamp: number;
  lapTimeMs: number;
  s1: SectorTimings;
  s2: SectorTimings;
  s3: SectorTimings;
}

/**
 * One frozen pass over the captured records. Caller passes in raw telemetry
 * + detected lap-crossings; engine answers everything sector-related behind
 * a small surface:
 *
 *   - `currentSector()` — which sector contains the latest sample
 *   - `liveSeverity()` — green/amber/red per sector, based on the latest
 *     completed lap (or `none` if no baseline yet)
 *   - `lapStates()` — full per-lap analysis, for the history strip
 *   - `setThresholds()` — slider control
 *
 * Internals (gate geometry, baseline selection, classification math) are
 * private. Today the gate geometry is a stub: each sample is assigned to a
 * sector by the IDEAL_LINE index range of its nearest reference point.
 * Tomorrow this swaps to FastF1/OpenF1-derived gate segments + telemetra-style
 * line-intersection without changing this class's public surface.
 */
export class SectorEngine {
  private readonly records: TelemetryRecord[];
  private readonly crossings: number[];
  private thresholds: SectorThresholds;

  /** Cache of lap analysis; invalidated on threshold change. */
  private _lapStates: LapSectorState[] | null = null;

  constructor(
    records: TelemetryRecord[],
    crossings: number[],
    thresholds: SectorThresholds = DEFAULT_THRESHOLDS,
  ) {
    this.records = records;
    this.crossings = crossings;
    this.thresholds = thresholds;
  }

  setThresholds(thresholds: SectorThresholds): void {
    this.thresholds = thresholds;
    this._lapStates = null;
  }

  /** Sector containing this sample, by nearest-point on IDEAL_LINE. */
  classify(lat: number, lon: number): Sector {
    const idx = nearestLineIdx(lat, lon);
    if (idx <= SECTOR_BOUNDARIES.sector1EndIdx) return 's1';
    if (idx <= SECTOR_BOUNDARIES.sector2EndIdx) return 's2';
    return 's3';
  }

  /** Latest sample's sector. */
  currentSector(): Sector | null {
    const latest = this.records[this.records.length - 1];
    if (!latest) return null;
    return this.classify(latest.latitude, latest.longitude);
  }

  /**
   * Severity for each sector based on the most recently completed lap.
   * Returns `none` for sectors that have no measurement yet.
   */
  liveSeverity(): Record<Sector, Severity> {
    const laps = this.lapStates();
    const last = laps[laps.length - 1];
    if (!last) return { s1: 'none', s2: 'none', s3: 'none' };
    return {
      s1: last.s1.severity,
      s2: last.s2.severity,
      s3: last.s3.severity,
    };
  }

  /** Best sector time observed across all completed laps. */
  baselineSectorMs(s: Sector): number | null {
    const laps = this.lapStates();
    const times = laps
      .map((l) => l[s].ms)
      .filter((ms): ms is number => ms !== null);
    if (times.length === 0) return null;
    return Math.min(...times);
  }

  /**
   * Per-completed-lap analysis. A lap is "completed" if there are two
   * consecutive start/finish crossings bracketing it. Records inside the lap
   * are bucketed into sectors by `classify()`. Sector ms is the wall-clock
   * span from first sample in that sector to first sample in the next.
   *
   * Severity uses a rolling baseline: the best observed sector time across
   * earlier completed laps. Lap 1 has no baseline → severity `none`. Lap N
   * compares to the best of laps 1..N-1.
   */
  lapStates(): LapSectorState[] {
    if (this._lapStates) return this._lapStates;
    if (this.crossings.length < 2) {
      this._lapStates = [];
      return this._lapStates;
    }

    // Best-so-far baseline per sector, updated as we walk laps in order.
    const baseline: Record<Sector, number | null> = { s1: null, s2: null, s3: null };
    const out: LapSectorState[] = [];

    for (let i = 0; i < this.crossings.length - 1; i++) {
      const startTs = this.crossings[i];
      const endTs = this.crossings[i + 1];

      const lapRecords: { rec: TelemetryRecord; idx: number }[] = [];
      for (let j = 0; j < this.records.length; j++) {
        const r = this.records[j];
        if (r.timestamp >= startTs && r.timestamp < endTs) lapRecords.push({ rec: r, idx: j });
      }
      if (lapRecords.length === 0) continue;

      const timings = this.bucketLap(lapRecords, startTs, endTs);
      const lap: LapSectorState = {
        lapNumber: i + 1,
        startTimestamp: startTs,
        endTimestamp: endTs,
        lapTimeMs: endTs - startTs,
        s1: this.applyBaseline(timings.s1, baseline.s1),
        s2: this.applyBaseline(timings.s2, baseline.s2),
        s3: this.applyBaseline(timings.s3, baseline.s3),
      };
      out.push(lap);

      // Update rolling baseline (best-so-far).
      for (const s of SECTORS) {
        const ms = lap[s].ms;
        if (ms !== null && (baseline[s] === null || ms < baseline[s]!)) baseline[s] = ms;
      }
    }

    this._lapStates = out;
    return out;
  }

  /**
   * Slice a lap's records into the three sectors and compute wall-clock ms.
   * Robust to noisy classification at the start/end of the lap: we look for
   * the first sample whose sector differs from the previous to mark the gate.
   */
  private bucketLap(
    lapRecords: { rec: TelemetryRecord; idx: number }[],
    lapStart: number,
    lapEnd: number,
  ): Record<Sector, { ms: number | null; startIdx: number; endIdx: number }> {
    let s1End = -1; // sample index inside the global records array where S1 ends
    let s2End = -1;

    let prev: Sector = 's1';
    for (const { rec, idx } of lapRecords) {
      const s = this.classify(rec.latitude, rec.longitude);
      if (prev === 's1' && s === 's2' && s1End === -1) s1End = idx;
      if (prev === 's2' && s === 's3' && s2End === -1) s2End = idx;
      prev = s;
    }

    const s1EndTs = s1End >= 0 ? this.records[s1End].timestamp : null;
    const s2EndTs = s2End >= 0 ? this.records[s2End].timestamp : null;

    return {
      s1: {
        ms: s1EndTs !== null ? s1EndTs - lapStart : null,
        startIdx: lapRecords[0].idx,
        endIdx: s1End >= 0 ? s1End : lapRecords[lapRecords.length - 1].idx,
      },
      s2: {
        ms: s1EndTs !== null && s2EndTs !== null ? s2EndTs - s1EndTs : null,
        startIdx: s1End >= 0 ? s1End : lapRecords[0].idx,
        endIdx: s2End >= 0 ? s2End : lapRecords[lapRecords.length - 1].idx,
      },
      s3: {
        ms: s2EndTs !== null ? lapEnd - s2EndTs : null,
        startIdx: s2End >= 0 ? s2End : lapRecords[0].idx,
        endIdx: lapRecords[lapRecords.length - 1].idx,
      },
    };
  }

  private applyBaseline(
    raw: { ms: number | null; startIdx: number; endIdx: number },
    baselineMs: number | null,
  ): SectorTimings {
    const severity: Severity = this.classifyDelta(raw.ms, baselineMs);
    return { ms: raw.ms, baselineMs, severity, startIdx: raw.startIdx, endIdx: raw.endIdx };
  }

  private classifyDelta(ms: number | null, baselineMs: number | null): Severity {
    if (ms === null || baselineMs === null) return 'none';
    const deltaPct = (ms - baselineMs) / baselineMs;
    if (deltaPct > this.thresholds.redPct) return 'red';
    if (deltaPct > this.thresholds.amberPct) return 'amber';
    return 'green';
  }
}

/* ----------------------- private helpers ----------------------- */

/** Nearest IDEAL_LINE point index to a lat/lon, by haversine. */
function nearestLineIdx(lat: number, lon: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < IDEAL_LINE.length; i++) {
    const [plat, plon] = IDEAL_LINE[i];
    const d = haversineMeters(lat, lon, plat, plon);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Sector index ranges along IDEAL_LINE. Exposed so map overlays can render
 * each sector as a polyline segment of the ideal line.
 */
export const SECTOR_INDEX_RANGES: Record<Sector, [number, number]> = {
  s1: [0, SECTOR_BOUNDARIES.sector1EndIdx],
  s2: [SECTOR_BOUNDARIES.sector1EndIdx, SECTOR_BOUNDARIES.sector2EndIdx],
  s3: [SECTOR_BOUNDARIES.sector2EndIdx, IDEAL_LINE.length - 1],
};

/** Used by lap detector — re-exported so callers can stick to one import. */
export const SECTOR_START_FINISH = START_FINISH;
export const SECTOR_START_FINISH_RADIUS_M = START_FINISH_RADIUS_M;
