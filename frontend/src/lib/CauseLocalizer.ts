import type { TelemetryRecord } from '../types/telemetry';
import { ZANDVOORT_CORNERS, type Corner } from '../constants/zandvoort';
import type { LapSectorState, Sector, Severity, SectorTimings } from './SectorEngine';
import { haversineMeters } from './lapDetection';

/**
 * The one-line, race-engineer-grade narrative card that lands in the UI.
 * Shape is deliberately small — UI is rendering only.
 */
export interface NarrativeCard {
  lapNumber: number;
  sector: Sector;
  severity: Severity;
  /** Imperative one-liner — what the driver should do next lap. "Brake 14m later into Tarzan." */
  advice: string;
  /** Diagnostic line — why this lap was slow. "Brake applied 14m early into Tarzan." */
  headline: string;
  /** Optional context line: estimated cost, baseline comparison number. */
  supporting: string;
  /** Corner identity attached to the headline. */
  corner: string;
  /** ms behind baseline on this sector. */
  lossMs: number;
  /** Wall-clock timestamp when the lap completed. */
  createdAt: number;
}

/* ----------------------- state machine ----------------------- */

export type DrivingState = 'braking' | 'full_throttle' | 'cornering' | 'coasting';

/**
 * v1.1 thresholds, telematics-literature scaled 2× for race cars.
 * Tunable from UI later.
 */
export interface StateMachineThresholds {
  brakeLongAccel: number;   // m/s², state is `braking` when linear_acc_x is below
  throttleLongAccel: number; // m/s², state is `full_throttle` when above
  cornerLatAccel: number;    // m/s², state is `cornering` when |linear_acc_y| is above
  cornerMinSamples: number;
  throttleMinSamples: number;
  /** Anomalous corner pair: peak-G drop >this percent of baseline */
  peakGDropPct: number;
  /** Brake-point shift in metres to be considered anomalous */
  brakePointShiftM: number;
}

export const DEFAULT_STATE_MACHINE_THRESHOLDS: StateMachineThresholds = {
  brakeLongAccel: -2.5,
  throttleLongAccel: 2.0,
  cornerLatAccel: 4.0,
  cornerMinSamples: 2,
  throttleMinSamples: 2,
  peakGDropPct: 0.15,
  brakePointShiftM: 10,
};

/**
 * Pure helper — same state precedence as the class method. Exposed for the
 * live driving-state hook so the UI can classify a single sample without
 * instantiating the full localizer.
 */
export function classifyDrivingState(
  r: TelemetryRecord,
  t: StateMachineThresholds = DEFAULT_STATE_MACHINE_THRESHOLDS,
): DrivingState {
  if (r.linear_acc_x < t.brakeLongAccel) return 'braking';
  if (r.linear_acc_x > t.throttleLongAccel) return 'full_throttle';
  if (Math.abs(r.linear_acc_y) > t.cornerLatAccel) return 'cornering';
  return 'coasting';
}

interface DrivingEvent {
  id: number;
  state: DrivingState;
  startTs: number;
  endTs: number;
  startLat: number;
  startLon: number;
  peakLatG: number; // m/s² peak |linear_acc_y|
  peakLongG: number; // m/s² peak |linear_acc_x|
  peakYawRate: number; // rad/s peak |yaw_rate|
  minSpeed: number; // m/s
  durationSamples: number;
  corner: Corner;
}

interface PairedEvent {
  state: DrivingState;
  current: DrivingEvent;
  baseline: DrivingEvent;
  corner: Corner;
  /** Metres between current.startLat/Lon and baseline.startLat/Lon. Signed by sign of (current - baseline) along the line. */
  brakePointShiftM: number;
  /** Drop in peakLatG as fraction of baseline. Positive = current weaker. */
  peakLatGDropPct: number;
  peakYawRateDropPct: number;
}

/**
 * Given a flagged (amber/red) sector on a completed lap, produce at most one
 * narrative explaining the most likely cause. Internals: state-machine
 * classifier → event consolidation → nearest-corner attach → event pairing
 * (current vs baseline lap, by corner identity + same state) → templated
 * narrative.
 *
 * One engine for every corner — no per-corner code paths. The same logic
 * would work on any other circuit; only the corner table changes.
 *
 * Algorithm reference:
 * github.com/mosesmulwa-bebop/F1-AWS-Corner-Analysis-in-Python (cumsum
 * change-point consolidation), plus telematics-literature thresholds
 * (Verizon Connect / Geotab / Motive).
 */
export class CauseLocalizer {
  private thresholds: StateMachineThresholds;

  constructor(thresholds: StateMachineThresholds = DEFAULT_STATE_MACHINE_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  setThresholds(t: StateMachineThresholds): void {
    this.thresholds = t;
  }

  explain(
    lap: LapSectorState,
    sector: Sector,
    records: TelemetryRecord[],
    baselineLap: LapSectorState | null,
  ): NarrativeCard | null {
    const timings = lap[sector];
    if (timings.severity === 'green' || timings.severity === 'none') return null;
    if (!baselineLap) return genericFallback(lap, sector, timings);

    const currentRecords = sliceRecords(records, lap.startTimestamp, lap.endTimestamp);
    const baselineRecords = sliceRecords(records, baselineLap.startTimestamp, baselineLap.endTimestamp);

    const currentEvents = this.eventize(currentRecords);
    const baselineEvents = this.eventize(baselineRecords);

    const pairs = this.pairEvents(currentEvents, baselineEvents, sector, lap, baselineLap);
    return this.narrate(pairs, lap, sector, timings);
  }

  /* ----------------------- private ----------------------- */

  private classifyState(r: TelemetryRecord): DrivingState {
    const t = this.thresholds;
    // Precedence braking > full_throttle > cornering > coasting — fixes the
    // latent overwrite bug in the reference notebook where pandas .loc
    // left-to-right assignment lets full-throttle masks overwrite brake masks.
    if (r.linear_acc_x < t.brakeLongAccel) return 'braking';
    if (r.linear_acc_x > t.throttleLongAccel) return 'full_throttle';
    if (Math.abs(r.linear_acc_y) > t.cornerLatAccel) return 'cornering';
    return 'coasting';
  }

  /**
   * Change-point cumsum consolidation: walk samples, when state changes from
   * the previous sample emit a new event; otherwise extend the current event
   * with the sample's peaks. Filter out runs shorter than the per-state
   * min-duration (Verizon Connect "sustained, not single-sample" convention).
   * Each event then carries the nearest corner from `ZANDVOORT_CORNERS`.
   */
  private eventize(records: TelemetryRecord[]): DrivingEvent[] {
    if (records.length === 0) return [];
    const out: DrivingEvent[] = [];
    let prev: DrivingState | null = null;
    let id = 0;

    for (const r of records) {
      const s = this.classifyState(r);
      if (s !== prev) {
        out.push({
          id: id++,
          state: s,
          startTs: r.timestamp,
          endTs: r.timestamp,
          startLat: r.latitude,
          startLon: r.longitude,
          peakLatG: Math.abs(r.linear_acc_y),
          peakLongG: Math.abs(r.linear_acc_x),
          peakYawRate: Math.abs(r.yaw_rate),
          minSpeed: r.speed,
          durationSamples: 1,
          corner: nearestCorner(r.latitude, r.longitude),
        });
        prev = s;
      } else {
        const cur = out[out.length - 1];
        cur.endTs = r.timestamp;
        cur.peakLatG = Math.max(cur.peakLatG, Math.abs(r.linear_acc_y));
        cur.peakLongG = Math.max(cur.peakLongG, Math.abs(r.linear_acc_x));
        cur.peakYawRate = Math.max(cur.peakYawRate, Math.abs(r.yaw_rate));
        cur.minSpeed = Math.min(cur.minSpeed, r.speed);
        cur.durationSamples += 1;
      }
    }

    return out.filter((e) => this.passesMinDuration(e));
  }

  private passesMinDuration(e: DrivingEvent): boolean {
    const t = this.thresholds;
    if (e.state === 'cornering') return e.durationSamples >= t.cornerMinSamples;
    if (e.state === 'full_throttle') return e.durationSamples >= t.throttleMinSamples;
    return true;
  }

  /**
   * Pair each current-lap event with its closest baseline-lap event of the
   * same state and same corner. Only pairs whose events land inside the
   * flagged sector window are returned.
   */
  private pairEvents(
    currentEvents: DrivingEvent[],
    baselineEvents: DrivingEvent[],
    sector: Sector,
    lap: LapSectorState,
    baselineLap: LapSectorState,
  ): PairedEvent[] {
    const out: PairedEvent[] = [];
    const baselineByKey = new Map<string, DrivingEvent[]>();
    for (const e of baselineEvents) {
      const key = `${e.state}:${e.corner.number}`;
      const arr = baselineByKey.get(key) ?? [];
      arr.push(e);
      baselineByKey.set(key, arr);
    }

    const sectorWindowCurrent = lapSectorWindow(lap, sector);
    const sectorWindowBaseline = lapSectorWindow(baselineLap, sector);

    for (const cur of currentEvents) {
      if (cur.startTs < sectorWindowCurrent.start || cur.startTs > sectorWindowCurrent.end) continue;
      const candidates = baselineByKey.get(`${cur.state}:${cur.corner.number}`) ?? [];
      const base = candidates.find(
        (b) => b.startTs >= sectorWindowBaseline.start && b.startTs <= sectorWindowBaseline.end,
      );
      if (!base) continue;

      const brakePointShiftM = signedDistance(cur, base, lap.startTimestamp, baselineLap.startTimestamp);
      const peakLatGDropPct = base.peakLatG > 0 ? (base.peakLatG - cur.peakLatG) / base.peakLatG : 0;
      const peakYawRateDropPct =
        base.peakYawRate > 0 ? (base.peakYawRate - cur.peakYawRate) / base.peakYawRate : 0;

      out.push({
        state: cur.state,
        current: cur,
        baseline: base,
        corner: cur.corner,
        brakePointShiftM,
        peakLatGDropPct,
        peakYawRateDropPct,
      });
    }

    return out;
  }

  /**
   * Pick the worst pair and emit the matching narrative template. Falls
   * through to a generic sector-slow narrative if no pair crosses threshold.
   */
  private narrate(
    pairs: PairedEvent[],
    lap: LapSectorState,
    sector: Sector,
    timings: SectorTimings,
  ): NarrativeCard {
    const t = this.thresholds;

    // 1. Brake-point shift on a braking event.
    let worstBrake: PairedEvent | null = null;
    for (const p of pairs) {
      if (p.state !== 'braking') continue;
      if (Math.abs(p.brakePointShiftM) < t.brakePointShiftM) continue;
      if (!worstBrake || Math.abs(p.brakePointShiftM) > Math.abs(worstBrake.brakePointShiftM)) {
        worstBrake = p;
      }
    }
    if (worstBrake) {
      const direction = worstBrake.brakePointShiftM > 0 ? 'late' : 'early';
      const metres = Math.round(Math.abs(worstBrake.brakePointShiftM));
      const lossSec = msToSec(timings.ms, timings.baselineMs);
      const advice =
        direction === 'early'
          ? `Brake ${metres}m later into ${worstBrake.corner.shortName}`
          : `Earlier brake into ${worstBrake.corner.shortName}`;
      return card(lap, sector, timings, {
        advice,
        headline: `Brake applied ${metres}m ${direction} into ${worstBrake.corner.shortName}`,
        supporting: `Estimated cost: ${lossSec}s vs baseline lap.`,
        corner: cornerLabel(worstBrake.corner),
      });
    }

    // 2. Peak lateral G drop on a cornering event.
    let worstCorner: PairedEvent | null = null;
    for (const p of pairs) {
      if (p.state !== 'cornering') continue;
      if (p.peakLatGDropPct < t.peakGDropPct) continue;
      if (!worstCorner || p.peakLatGDropPct > worstCorner.peakLatGDropPct) worstCorner = p;
    }
    if (worstCorner) {
      const pct = Math.round(worstCorner.peakLatGDropPct * 100);
      const note = worstCorner.corner.note ? ` — ${worstCorner.corner.note}` : '';
      return card(lap, sector, timings, {
        advice: `Commit harder through ${worstCorner.corner.shortName}`,
        headline: `Under-commit at ${worstCorner.corner.shortName} — peak lateral G ${pct}% lower than baseline`,
        supporting: `Carry more apex speed next lap${note}.`,
        corner: cornerLabel(worstCorner.corner),
      });
    }

    // 3. Yaw-rate drop on a cornering event.
    let worstYaw: PairedEvent | null = null;
    for (const p of pairs) {
      if (p.state !== 'cornering') continue;
      if (p.peakYawRateDropPct < t.peakGDropPct) continue;
      if (!worstYaw || p.peakYawRateDropPct > worstYaw.peakYawRateDropPct) worstYaw = p;
    }
    if (worstYaw) {
      const pct = Math.round(worstYaw.peakYawRateDropPct * 100);
      return card(lap, sector, timings, {
        advice: `Earlier turn-in at ${worstYaw.corner.shortName}`,
        headline: `Slow rotation through ${worstYaw.corner.shortName} — yaw rate ${pct}% below baseline`,
        supporting: `Rotate the car earlier into the apex.`,
        corner: cornerLabel(worstYaw.corner),
      });
    }

    // 4. Fallback.
    return genericFallback(lap, sector, timings);
  }
}

/* ----------------------- helpers ----------------------- */

function card(
  lap: LapSectorState,
  sector: Sector,
  timings: SectorTimings,
  partial: Pick<NarrativeCard, 'advice' | 'headline' | 'supporting' | 'corner'>,
): NarrativeCard {
  const lossMs =
    timings.baselineMs !== null && timings.ms !== null ? timings.ms - timings.baselineMs : 0;
  return {
    lapNumber: lap.lapNumber,
    sector,
    severity: timings.severity,
    advice: partial.advice,
    headline: partial.headline,
    supporting: partial.supporting,
    corner: partial.corner,
    lossMs,
    createdAt: lap.endTimestamp,
  };
}

function genericFallback(lap: LapSectorState, sector: Sector, timings: SectorTimings): NarrativeCard {
  const fallback = FALLBACK_CORNER[sector];
  const lossSec = msToSec(timings.ms, timings.baselineMs);
  return card(lap, sector, timings, {
    advice: `Push harder through ${fallback.shortName}`,
    headline: `Sector ${sectorNumber(sector)} slow — likely ${fallback.shortName}`,
    supporting: `${lossSec}s behind baseline through ${fallback.name}.`,
    corner: cornerLabel(fallback),
  });
}

const FALLBACK_CORNER: Record<Sector, Corner> = {
  s1: ZANDVOORT_CORNERS[0], // Tarzan
  s2: ZANDVOORT_CORNERS[5], // Scheivlak
  s3: ZANDVOORT_CORNERS[13], // Arie Luyendyk
};

function sliceRecords(records: TelemetryRecord[], startTs: number, endTs: number): TelemetryRecord[] {
  return records.filter((r) => r.timestamp >= startTs && r.timestamp < endTs);
}

/** Find the closest entry in ZANDVOORT_CORNERS to a lat/lon by haversine. */
function nearestCorner(lat: number, lon: number): Corner {
  let best = ZANDVOORT_CORNERS[0];
  let bestD = Infinity;
  for (const c of ZANDVOORT_CORNERS) {
    const d = haversineMeters(lat, lon, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Signed metres between two event-start GPS points. Positive = current event
 * happened later (further along the racing line) than baseline; negative =
 * earlier. Sign comes from lap-relative startTs (offset from each event's
 * own lap start) — comparing absolute timestamps across different laps would
 * always read as "later" since the slow lap happens after the baseline lap.
 */
function signedDistance(
  cur: DrivingEvent,
  base: DrivingEvent,
  curLapStart: number,
  baseLapStart: number,
): number {
  const distance = haversineMeters(cur.startLat, cur.startLon, base.startLat, base.startLon);
  const curOffset = cur.startTs - curLapStart;
  const baseOffset = base.startTs - baseLapStart;
  const sign = curOffset >= baseOffset ? 1 : -1;
  return sign * distance;
}

function lapSectorWindow(lap: LapSectorState, sector: Sector): { start: number; end: number } {
  // Pull the timestamps that bracket the sector inside this lap from the
  // SectorEngine's already-computed timing windows. Falls back to whole-lap.
  const t = lap[sector];
  // SectorTimings has startIdx/endIdx into the *global* records array. We
  // re-derive timestamps from the surrounding lap window since callers pass
  // the lap's records separately.
  void t;
  if (sector === 's1') return { start: lap.startTimestamp, end: lap.startTimestamp + (lap.s1.ms ?? lap.lapTimeMs) };
  if (sector === 's2') {
    const s1End = lap.startTimestamp + (lap.s1.ms ?? 0);
    return { start: s1End, end: s1End + (lap.s2.ms ?? lap.lapTimeMs) };
  }
  const s2End = lap.startTimestamp + (lap.s1.ms ?? 0) + (lap.s2.ms ?? 0);
  return { start: s2End, end: lap.endTimestamp };
}

function msToSec(ms: number | null, baselineMs: number | null): string {
  if (ms === null || baselineMs === null) return '?';
  return ((ms - baselineMs) / 1000).toFixed(2);
}

function sectorNumber(s: Sector): number {
  return s === 's1' ? 1 : s === 's2' ? 2 : 3;
}

function cornerLabel(c: Corner): string {
  const t = c.letter ? `T${c.number}${c.letter}` : `T${c.number}`;
  return `${t} ${c.name}`;
}

/** Stable key for "this lap has been narrated", used by the store. */
export function lapNarrationKey(card: NarrativeCard): string {
  return `lap${card.lapNumber}.${card.sector}`;
}
