import { IDEAL_LINE, TURN_LABELS } from '../constants/zandvoort';
import type { TelemetryRecord } from '../types/telemetry';
import { haversineMeters } from './lapDetection';

export interface TrackProjection {
  segmentIndex: number;
  trackPosition: number;
  distanceMeters: number;
}

export interface HeatmapBin {
  index: number;
  startPosition: number;
  endPosition: number;
  midpoint: [number, number];
  avgSpeed: number;
  maxSpeed: number;
  avgLateralG: number;
  maxBrakingG: number;
  avgDeviationM: number;
  sampleCount: number;
}

export interface RaceEvent {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  corner: string;
  trackPosition: number;
  likelyCause: string;
  evidence: string[];
  confidence: number;
}

export interface SensorHealth {
  freshnessMs: number | null;
  packetRateHz: number;
  gpsScore: number;
  imuScore: number;
  dropoutCount: number;
  confidenceScore: number;
  status: 'good' | 'watch' | 'poor';
}

export interface RunSummary {
  runId: number;
  sampleCount: number;
  topSpeed: number;
  avgSpeed: number;
  cleanScore: number;
  confidenceScore: number;
  startedAt: number;
  endedAt: number;
}

const ARC_LENGTHS = IDEAL_LINE.reduce<number[]>((acc, point, i) => {
  if (i === 0) return [0];
  const prev = IDEAL_LINE[i - 1];
  acc.push(acc[i - 1] + haversineMeters(prev[0], prev[1], point[0], point[1]));
  return acc;
}, []);
const TOTAL_LENGTH = ARC_LENGTHS[ARC_LENGTHS.length - 1] || 1;

function closestOnSegment(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
) {
  const dx = bLon - aLon;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pLon - aLon) * dx + (pLat - aLat) * dy) / lenSq));
  return { lat: aLat + t * dy, lon: aLon + t * dx, t };
}

export function projectToTrack(lat: number, lon: number): TrackProjection {
  let best: TrackProjection = { segmentIndex: 0, trackPosition: 0, distanceMeters: Infinity };

  for (let i = 0; i < IDEAL_LINE.length - 1; i++) {
    const a = IDEAL_LINE[i];
    const b = IDEAL_LINE[i + 1];
    const closest = closestOnSegment(lat, lon, a[0], a[1], b[0], b[1]);
    const distanceMeters = haversineMeters(lat, lon, closest.lat, closest.lon);
    if (distanceMeters < best.distanceMeters) {
      best = {
        segmentIndex: i,
        distanceMeters,
        trackPosition: (ARC_LENGTHS[i] + closest.t * (ARC_LENGTHS[i + 1] - ARC_LENGTHS[i])) / TOTAL_LENGTH,
      };
    }
  }

  return best;
}

export function nearestTurn(segmentIndex: number): string {
  return TURN_LABELS.reduce((best, turn) =>
    Math.abs(turn.idx - segmentIndex) < Math.abs(best.idx - segmentIndex) ? turn : best,
  ).name;
}

export function pointAtTrackPosition(position: number): [number, number] {
  const target = Math.max(0, Math.min(1, position)) * TOTAL_LENGTH;
  const segmentIndex = ARC_LENGTHS.findIndex((length, i) => i > 0 && length >= target);
  const i = segmentIndex <= 0 ? 1 : segmentIndex;
  const a = IDEAL_LINE[i - 1];
  const b = IDEAL_LINE[i];
  const segmentLength = Math.max(ARC_LENGTHS[i] - ARC_LENGTHS[i - 1], 1);
  const t = (target - ARC_LENGTHS[i - 1]) / segmentLength;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function buildHeatmapBins(records: TelemetryRecord[], binCount = 80): HeatmapBin[] {
  const buckets = Array.from({ length: binCount }, (_, index) => ({
    index,
    speedSum: 0,
    maxSpeed: 0,
    latGSum: 0,
    brakingG: 0,
    deviationSum: 0,
    sampleCount: 0,
  }));

  records.forEach((record) => {
    if (record.latitude === null || record.longitude === null) return;
    const projection = projectToTrack(record.latitude, record.longitude);
    const index = Math.min(binCount - 1, Math.floor(projection.trackPosition * binCount));
    const bucket = buckets[index];
    const speed = record.speed ?? 0;
    bucket.speedSum += speed;
    bucket.maxSpeed = Math.max(bucket.maxSpeed, speed);
    bucket.latGSum += Math.abs((record.acc_y ?? 0) / 9.81);
    bucket.brakingG = Math.max(bucket.brakingG, Math.max(0, -((record.linear_acc_x ?? record.acc_x ?? 0) / 9.81)));
    bucket.deviationSum += projection.distanceMeters;
    bucket.sampleCount += 1;
  });

  return buckets.map((bucket) => {
    const startPosition = bucket.index / binCount;
    const endPosition = (bucket.index + 1) / binCount;
    const sampleCount = bucket.sampleCount;
    return {
      index: bucket.index,
      startPosition,
      endPosition,
      midpoint: pointAtTrackPosition((startPosition + endPosition) / 2),
      avgSpeed: sampleCount ? bucket.speedSum / sampleCount : 0,
      maxSpeed: bucket.maxSpeed,
      avgLateralG: sampleCount ? bucket.latGSum / sampleCount : 0,
      maxBrakingG: bucket.brakingG,
      avgDeviationM: sampleCount ? bucket.deviationSum / sampleCount : 0,
      sampleCount,
    };
  });
}

function confidenceFromEvidence(count: number, sensorPenalty: number) {
  return Math.max(35, Math.min(95, 52 + count * 11 - sensorPenalty));
}

export function analyzeCornerCauses(records: TelemetryRecord[]): RaceEvent[] {
  const events: RaceEvent[] = [];
  let lastEventAt = 0;

  records.forEach((record, index) => {
    if (record.latitude === null || record.longitude === null) return;
    const projection = projectToTrack(record.latitude, record.longitude);
    const previous = index > 0 ? records[index - 1] : null;
    const next = index < records.length - 1 ? records[index + 1] : null;
    const lateralG = Math.abs((record.acc_y ?? 0) / 9.81);
    const longG = (record.linear_acc_x ?? record.acc_x ?? 0) / 9.81;
    const yawRate = Math.abs(record.yaw_rate ?? 0);
    const speed = record.speed ?? 0;
    const gpsWeak = (record.satellites ?? 0) > 0 && (record.satellites ?? 0) < 5;
    const imuWeak = [record.status_sys, record.status_gyro, record.status_acc, record.status_mag].some((v) => (v ?? 3) < 2);
    const gpsJump =
      previous?.latitude !== null &&
      previous?.longitude !== null &&
      previous !== null &&
      haversineMeters(previous.latitude, previous.longitude, record.latitude, record.longitude) > Math.max(18, speed * 0.12 + 10);

    const evidence: string[] = [];
    const causes: string[] = [];

    if (projection.distanceMeters > 8) {
      evidence.push(`${projection.distanceMeters.toFixed(1)}m from ideal line`);
      if (speed > 85) {
        causes.push('entry speed too high');
        evidence.push(`${speed.toFixed(0)} km/h while deviation is increasing`);
      }
      if (longG > -0.12 && speed > 60) {
        causes.push('late or weak braking');
        evidence.push('low deceleration before/inside corner');
      }
      if (lateralG > 0.35 && yawRate < 0.18) {
        causes.push('understeer');
        evidence.push(`high lateral load (${lateralG.toFixed(2)}g), low yaw response`);
      }
    }

    if (yawRate > 0.75 || (previous && Math.abs((record.yaw_rate ?? 0) - (previous.yaw_rate ?? 0)) > 0.55)) {
      causes.push('oversteer or rotation instability');
      evidence.push(`yaw spike ${yawRate.toFixed(2)} rad/s`);
    }

    if (next && speed < 45 && (next.linear_acc_x ?? next.acc_x ?? 0) < 0.5) {
      causes.push('poor corner exit');
      evidence.push('low exit speed with delayed forward acceleration');
    }

    if (gpsWeak || imuWeak || gpsJump) {
      causes.push('sensor artifact possible');
      if (gpsWeak) evidence.push(`${record.satellites} GPS satellites`);
      if (imuWeak) evidence.push('IMU calibration below 2');
      if (gpsJump) evidence.push('GPS jump not matched by normal motion');
    }

    const isEvent = causes.length > 0 && record.timestamp - lastEventAt > 2_500;
    if (!isEvent) return;
    lastEventAt = record.timestamp;

    const sensorPenalty = gpsWeak || imuWeak || gpsJump ? 18 : 0;
    const severity = projection.distanceMeters > 14 || yawRate > 1 ? 'critical' : projection.distanceMeters > 8 || sensorPenalty ? 'warning' : 'info';
    events.push({
      id: `${record.timestamp}-${index}`,
      timestamp: record.timestamp,
      severity,
      title: severity === 'critical' ? 'Major deviation detected' : 'Telemetry event',
      corner: nearestTurn(projection.segmentIndex),
      trackPosition: projection.trackPosition,
      likelyCause: Array.from(new Set(causes)).join(' + '),
      evidence: Array.from(new Set(evidence)).slice(0, 4),
      confidence: confidenceFromEvidence(evidence.length, sensorPenalty),
    });
  });

  return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
}

export function computeSensorHealth(records: TelemetryRecord[], now = Date.now()): SensorHealth {
  if (records.length === 0) {
    return { freshnessMs: null, packetRateHz: 0, gpsScore: 0, imuScore: 0, dropoutCount: 0, confidenceScore: 0, status: 'poor' };
  }

  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1];
  const durationSeconds = Math.max(1, (latest.timestamp - sorted[0].timestamp) / 1000);
  const packetRateHz = sorted.length / durationSeconds;
  const dropoutCount = sorted.slice(1).filter((record, i) => record.timestamp - sorted[i].timestamp > 2_000).length;
  const avgSatellites = sorted.reduce((sum, record) => sum + (record.satellites ?? 0), 0) / sorted.length;
  const avgCalibration =
    sorted.reduce(
      (sum, record) => sum + ((record.status_sys ?? 0) + (record.status_gyro ?? 0) + (record.status_acc ?? 0) + (record.status_mag ?? 0)) / 4,
      0,
    ) / sorted.length;
  const gpsScore = Math.min(100, (avgSatellites / 8) * 100);
  const imuScore = Math.min(100, (avgCalibration / 3) * 100);
  const freshnessMs = now - latest.timestamp;
  const freshnessScore = freshnessMs < 10_000 ? 100 : Math.max(0, 100 - (freshnessMs - 10_000) / 500);
  const confidenceScore = Math.max(0, Math.min(100, gpsScore * 0.35 + imuScore * 0.25 + freshnessScore * 0.25 + Math.min(100, packetRateHz * 30) * 0.15 - dropoutCount * 4));
  const status = confidenceScore >= 75 ? 'good' : confidenceScore >= 45 ? 'watch' : 'poor';

  return { freshnessMs, packetRateHz, gpsScore, imuScore, dropoutCount, confidenceScore, status };
}

export function computeRunSummaries(records: TelemetryRecord[]): RunSummary[] {
  const byRun = new Map<number, TelemetryRecord[]>();
  records.forEach((record) => {
    const run = record.session_id ?? 0;
    byRun.set(run, [...(byRun.get(run) ?? []), record]);
  });

  return Array.from(byRun.entries())
    .map(([runId, runRecords]) => {
      const speeds = runRecords.map((record) => record.speed ?? 0);
      const projections = runRecords
        .filter((record) => record.latitude !== null && record.longitude !== null)
        .map((record) => projectToTrack(record.latitude, record.longitude));
      const cleanScore = Math.max(0, 100 - (projections.reduce((sum, p) => sum + p.distanceMeters, 0) / Math.max(1, projections.length)) * 4);
      const health = computeSensorHealth(runRecords);
      return {
        runId,
        sampleCount: runRecords.length,
        topSpeed: Math.max(...speeds, 0),
        avgSpeed: speeds.reduce((sum, speed) => sum + speed, 0) / Math.max(1, speeds.length),
        cleanScore,
        confidenceScore: health.confidenceScore,
        startedAt: Math.min(...runRecords.map((record) => record.timestamp)),
        endedAt: Math.max(...runRecords.map((record) => record.timestamp)),
      };
    })
    .sort((a, b) => b.cleanScore + b.topSpeed * 0.2 - (a.cleanScore + a.topSpeed * 0.2));
}
