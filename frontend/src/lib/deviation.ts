import type { DeviationPoint, TelemetryRecord } from '../types/telemetry';
import { IDEAL_LINE, TURN_LABELS } from '../constants/zandvoort';
import { haversineMeters } from './lapDetection';

// Pre-compute cumulative arc lengths along the ideal line
function buildArcLengths(line: [number, number][]): number[] {
  const lengths = [0];
  for (let i = 1; i < line.length; i++) {
    lengths.push(
      lengths[i - 1] +
        haversineMeters(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]),
    );
  }
  return lengths;
}

const ARC_LENGTHS = buildArcLengths(IDEAL_LINE);
const TOTAL_LENGTH = ARC_LENGTHS[ARC_LENGTHS.length - 1];

// Project point P onto segment A→B (treating lat/lon as flat 2D — valid for ~3km scale)
function closestOnSegment(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number,
): { closestLat: number; closestLon: number; t: number } {
  const dx = bLon - aLon;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pLon - aLon) * dx + (pLat - aLat) * dy) / lenSq));
  return { closestLat: aLat + t * dy, closestLon: aLon + t * dx, t };
}

function closestPointOnIdealLine(lat: number, lon: number): {
  segmentIndex: number;
  t: number;
  distMeters: number;
  trackPosition: number;
} {
  let best = { segmentIndex: 0, t: 0, distMeters: Infinity, trackPosition: 0 };

  for (let i = 0; i < IDEAL_LINE.length - 1; i++) {
    const { closestLat, closestLon, t } = closestOnSegment(
      lat, lon,
      IDEAL_LINE[i][0], IDEAL_LINE[i][1],
      IDEAL_LINE[i + 1][0], IDEAL_LINE[i + 1][1],
    );
    const dist = haversineMeters(lat, lon, closestLat, closestLon);
    if (dist < best.distMeters) {
      const trackPosition =
        (ARC_LENGTHS[i] + t * (ARC_LENGTHS[i + 1] - ARC_LENGTHS[i])) / TOTAL_LENGTH;
      best = { segmentIndex: i, t, distMeters: dist, trackPosition };
    }
  }
  return best;
}

export function computeDeviationPoints(records: TelemetryRecord[]): DeviationPoint[] {
  return records.map((r) => {
    const { segmentIndex, distMeters, trackPosition } = closestPointOnIdealLine(
      r.latitude,
      r.longitude,
    );
    const nearestTurn = TURN_LABELS.reduce((acc, tl) =>
      Math.abs(tl.idx - segmentIndex) < Math.abs(acc.idx - segmentIndex) ? tl : acc,
    ).name;
    return {
      trackPosition,
      distanceMeters: distMeters,
      timestamp: r.timestamp,
      speed: r.speed,
      nearestTurn: distMeters > 3 ? nearestTurn : undefined,
    };
  });
}

interface TurnInsight {
  turn: string;
  maxDeviationM: number;
  avgApexSpeedKph: number;
  understeerCount: number;
}

export function generateInsights(
  records: TelemetryRecord[],
  deviationPoints: DeviationPoint[],
): string[] {
  const byTurn = new Map<string, TurnInsight>();

  records.forEach((r, i) => {
    const dp = deviationPoints[i];
    if (!dp?.nearestTurn) return;
    const key = dp.nearestTurn;
    const existing = byTurn.get(key) ?? {
      turn: key,
      maxDeviationM: 0,
      avgApexSpeedKph: 0,
      understeerCount: 0,
    };
    // Understeer: high lateral G but low yaw rate
    const isUndersteer = Math.abs(r.acc_y) > 0.4 * 9.81 && Math.abs(r.yaw_rate) < 0.15;
    byTurn.set(key, {
      turn: key,
      maxDeviationM: Math.max(existing.maxDeviationM, dp.distanceMeters),
      avgApexSpeedKph: (existing.avgApexSpeedKph + r.speed) / 2,
      understeerCount: existing.understeerCount + (isUndersteer ? 1 : 0),
    });
  });

  return Array.from(byTurn.values())
    .filter((t) => t.maxDeviationM > 3)
    .sort((a, b) => b.maxDeviationM - a.maxDeviationM)
    .map((t) => {
      const dev = t.maxDeviationM.toFixed(1);
      const spd = t.avgApexSpeedKph.toFixed(0);
      const us = t.understeerCount > 3 ? ' — understeer detected (high lateral G, low yaw rate)' : '';
      return `${t.turn}: up to ${dev}m wide of ideal line, avg speed ${spd} km/h${us}`;
    });
}
