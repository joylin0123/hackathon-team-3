import { describe, it, expect } from 'vitest';
import { SectorEngine } from './SectorEngine';
import { IDEAL_LINE, START_FINISH } from '../constants/zandvoort';
import type { TelemetryRecord } from '../types/telemetry';

/**
 * Smoke test for the sector severity pipeline: 2 clean laps establish a
 * baseline; lap 3 spends extra time in S2; assert s2.severity === 'red'.
 */
describe('SectorEngine', () => {
  it('flags slow S2 on lap 3 against rolling-best baseline', () => {
    const { records, crossings } = buildSyntheticSession();
    const engine = new SectorEngine(records, crossings);
    const laps = engine.lapStates();
    expect(laps.length).toBeGreaterThanOrEqual(3);
    const lap3 = laps[2];
    expect(lap3.s2.severity).toBe('red');
    expect(lap3.s2.baselineMs).not.toBeNull();
    expect(lap3.s2.ms).not.toBeNull();
    expect(lap3.s2.ms!).toBeGreaterThan(lap3.s2.baselineMs!);
  });
});

/**
 * Build 3 laps along IDEAL_LINE. Each lap is ~44 samples (1 per IDEAL_LINE
 * point). Lap 3 stretches S2 by inserting extra dwell samples at the
 * Scheivlak point — this makes its S2 ms ~50% larger than baseline S2.
 */
function buildSyntheticSession(): { records: TelemetryRecord[]; crossings: number[] } {
  const records: TelemetryRecord[] = [];
  const crossings: number[] = [];
  let ts = 0;
  const stepMs = 1000;

  for (let lap = 0; lap < 3; lap++) {
    const lapStart = ts;
    crossings.push(lapStart);
    for (let i = 0; i < IDEAL_LINE.length; i++) {
      const [lat, lon] = IDEAL_LINE[i];
      records.push(stubRecord(ts, lat, lon));
      ts += stepMs;
      // Lap 2 (index 2): add extra dwell samples through S2 (idx 10–22)
      if (lap === 2 && i >= 10 && i <= 22) {
        records.push(stubRecord(ts, lat, lon));
        ts += stepMs;
      }
    }
  }
  // Final start/finish crossing to close lap 3
  crossings.push(ts);
  records.push(stubRecord(ts, START_FINISH.lat, START_FINISH.lon));

  return { records, crossings };
}

function stubRecord(timestamp: number, latitude: number, longitude: number): TelemetryRecord {
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
    linear_acc_x: 0, linear_acc_y: 0, linear_acc_z: 0,
  };
}
