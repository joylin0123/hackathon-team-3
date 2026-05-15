import { describe, it, expect } from 'vitest';
import { CauseLocalizer } from './CauseLocalizer';
import { SectorEngine } from './SectorEngine';
import { IDEAL_LINE, START_FINISH } from '../constants/zandvoort';
import type { TelemetryRecord } from '../types/telemetry';

/**
 * Smoke test for the full state-machine → eventize → pair → narrate pipeline.
 *
 * Lap 1 (baseline): clean lap, brakes hard at IDEAL_LINE index 3 (top of
 * Tarzan). Lap 2: identical except brakes one sample earlier (index 2),
 * which sits ~80 m up the straight. Assert the narrative card mentions
 * "Brake applied" and "Tarzan".
 */
describe('CauseLocalizer', () => {
  it('detects early brake into Tarzan and emits a brake-point narrative', () => {
    const { records, crossings } = buildBrakeShiftSession();
    const engine = new SectorEngine(records, crossings, { amberPct: 0.001, redPct: 0.005 });
    const laps = engine.lapStates();
    expect(laps.length).toBe(2);

    const lap2 = laps[1];
    expect(lap2.s1.severity === 'red' || lap2.s1.severity === 'amber').toBe(true);

    const localizer = new CauseLocalizer({
      brakeLongAccel: -2.5,
      throttleLongAccel: 2.0,
      cornerLatAccel: 4.0,
      cornerMinSamples: 1, // relax for low-resolution synthetic stream
      throttleMinSamples: 1,
      peakGDropPct: 0.15,
      brakePointShiftM: 10,
    });

    const card = localizer.explain(lap2, 's1', records, laps[0]);
    expect(card).not.toBeNull();
    expect(card!.headline.toLowerCase()).toContain('brake applied');
    expect(card!.headline.toLowerCase()).toContain('tarzan');
    expect(card!.advice.toLowerCase()).toContain('later');
    expect(card!.advice.toLowerCase()).toContain('tarzan');
  });
});

function buildBrakeShiftSession(): { records: TelemetryRecord[]; crossings: number[] } {
  const records: TelemetryRecord[] = [];
  const crossings: number[] = [];
  let ts = 0;
  const stepMs = 1000;

  for (let lap = 0; lap < 2; lap++) {
    crossings.push(ts);
    for (let i = 0; i < IDEAL_LINE.length; i++) {
      const [lat, lon] = IDEAL_LINE[i];
      // Baseline brakes at index 3, slow lap brakes at index 2 (earlier on
      // the approach to Tarzan). Both positions are close enough to T1 for
      // nearestCorner to attach the braking event to T1.
      const brakeIdx = lap === 0 ? 3 : 2;
      const isBraking = i === brakeIdx;
      records.push(stubRecord(ts, lat, lon, isBraking ? -5 : 0));
      ts += stepMs;
      // Lap 2 brakes earlier → has an extra dwell sample at the brake point,
      // making S1 measurably slower so SectorEngine flags it.
      if (lap === 1 && isBraking) {
        records.push(stubRecord(ts, lat, lon, -5));
        ts += stepMs;
      }
    }
  }
  crossings.push(ts);
  records.push(stubRecord(ts, START_FINISH.lat, START_FINISH.lon, 0));

  return { records, crossings };
}

function stubRecord(
  timestamp: number,
  latitude: number,
  longitude: number,
  linearAccX: number,
): TelemetryRecord {
  return {
    timestamp,
    team_id: 1,
    session_id: 1,
    latitude,
    longitude,
    altitude: 0,
    speed: 50,
    course: 0,
    satellites: 10,
    gps_timestamp: timestamp,
    acc_x: 0, acc_y: 0, acc_z: 0,
    gyro_x: 0, gyro_y: 0, gyro_z: 0,
    mag_x: 0, mag_y: 0, mag_z: 0,
    status_sys: 3, status_gyro: 3, status_acc: 3, status_mag: 3,
    pitch_rate: 0, roll_rate: 0, yaw_rate: 0,
    pitch_angle: 0, roll_angle: 0, yaw_angle: 0,
    temperature: 20,
    gravity_x: 0, gravity_y: 0, gravity_z: 9.81,
    abs_orientation_x: 0, abs_orientation_y: 0, abs_orientation_z: 0, abs_orientation_w: 1,
    linear_acc_x: linearAccX,
    linear_acc_y: 0,
    linear_acc_z: 0,
  };
}
