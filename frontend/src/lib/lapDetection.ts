import type { LapInfo, TelemetryRecord } from '../types/telemetry';
import {
  IDEAL_LINE,
  SECTOR_BOUNDARIES,
  SECTOR_LANDMARK_RADIUS_M,
  START_FINISH,
  START_FINISH_RADIUS_M,
} from '../constants/zandvoort';

const LAP_COOLDOWN_MS = 30_000;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function detectLapCrossings(records: TelemetryRecord[]): number[] {
  const crossings: number[] = [];
  let lastCrossing = 0;
  for (const r of records) {
    const dist = haversineMeters(r.latitude, r.longitude, START_FINISH.lat, START_FINISH.lon);
    if (dist < START_FINISH_RADIUS_M && r.timestamp - lastCrossing > LAP_COOLDOWN_MS) {
      crossings.push(r.timestamp);
      lastCrossing = r.timestamp;
    }
  }
  return crossings;
}

const S1_LANDMARK = IDEAL_LINE[SECTOR_BOUNDARIES.sector1EndIdx];
const S2_LANDMARK = IDEAL_LINE[SECTOR_BOUNDARIES.sector2EndIdx];

export function computeLaps(records: TelemetryRecord[], crossings: number[]): LapInfo[] {
  if (crossings.length < 2) return [];
  return crossings.slice(0, -1).map((startTs, i) => {
    const endTs = crossings[i + 1];
    const lapRecords = records.filter((r) => r.timestamp >= startTs && r.timestamp < endTs);
    const topSpeed = lapRecords.length > 0 ? Math.max(...lapRecords.map((r) => r.speed)) : 0;

    const s1Record = lapRecords.find(
      (r) => haversineMeters(r.latitude, r.longitude, S1_LANDMARK[0], S1_LANDMARK[1]) < SECTOR_LANDMARK_RADIUS_M,
    );
    const s2Record = lapRecords.find(
      (r) => haversineMeters(r.latitude, r.longitude, S2_LANDMARK[0], S2_LANDMARK[1]) < SECTOR_LANDMARK_RADIUS_M,
    );

    const sector1Ms = s1Record ? s1Record.timestamp - startTs : null;
    const sector2Ms = s1Record && s2Record ? s2Record.timestamp - s1Record.timestamp : null;
    const sector3Ms = s2Record ? endTs - s2Record.timestamp : null;

    return {
      lapNumber: i + 1,
      startTimestamp: startTs,
      endTimestamp: endTs,
      lapTimeMs: endTs - startTs,
      sector1Ms,
      sector2Ms,
      sector3Ms,
      topSpeed,
    };
  });
}

// Returns in-progress lap info (no end timestamp yet)
export function getCurrentLapInfo(
  records: TelemetryRecord[],
  crossings: number[],
): { startTimestamp: number; elapsedMs: number } | null {
  if (crossings.length === 0) return null;
  const lastCrossing = crossings[crossings.length - 1];
  const latestRecord = records[records.length - 1];
  if (!latestRecord) return null;
  return {
    startTimestamp: lastCrossing,
    elapsedMs: latestRecord.timestamp - lastCrossing,
  };
}
