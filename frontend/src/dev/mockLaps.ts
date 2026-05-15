import { IDEAL_LINE, START_FINISH } from '../constants/zandvoort';
import type { TelemetryRecord } from '../types/telemetry';

/**
 * Synthesised 7-lap session that exercises the full Sector Insight pipeline
 * end-to-end without needing the Pi or AWS. Used by the dev "Load mock laps"
 * button. NOT shipped in production builds (`import.meta.env.DEV` gate).
 *
 * Lap layout:
 *   - Laps 1–4: clean reference laps with consistent braking + cornering events.
 *   - Lap 5: mild Scheivlak under-commit (amber S2).
 *   - Lap 6: clean again.
 *   - Lap 7: severe Scheivlak under-commit (red S2) + slow rotation → triggers
 *     the headline narrative ("Under-commit at Scheivlak — peak lateral G N%
 *     lower than baseline") and a red alert.
 */
export function buildMockSession(teamId = 99, sessionId = Date.now()): TelemetryRecord[] {
  const records: TelemetryRecord[] = [];
  const stepMs = 1000;
  let ts = Date.now() - 7 * IDEAL_LINE.length * stepMs;

  // Brake-zone indices into IDEAL_LINE (approach to each major corner)
  const brakeIdxs = new Set([2, 8, 15, 20, 26, 37]);
  // Cornering indices — the apex window of each major corner
  const cornerApex: Record<number, number> = {
    3: 5.5,    // T1 Tarzan
    9: 5.0,    // T3 Hugenholtz
    16: 6.0,   // Scheivlak
    17: 6.5,
    22: 5.0,   // T9/T10
    25: 4.8,   // Chicane
    40: 5.5,   // T14
  };

  for (let lap = 1; lap <= 7; lap++) {
    const scheivlakWeakening =
      lap === 5 ? 0.7 : lap === 7 ? 0.45 : 1.0; // fraction of nominal peak lat G
    const scheivlakExtraDwell = lap === 5 ? 1 : lap === 7 ? 3 : 0;

    for (let i = 0; i < IDEAL_LINE.length; i++) {
      const [lat, lon] = IDEAL_LINE[i];

      const isBraking = brakeIdxs.has(i);
      const apexG = cornerApex[i] ?? 0;
      const inScheivlak = i >= 15 && i <= 18;
      const peakLatY = apexG * (inScheivlak ? scheivlakWeakening : 1.0);

      records.push(makeRecord({
        ts,
        teamId,
        sessionId,
        lat,
        lon,
        linearAccX: isBraking ? -4.5 : i === 1 || i === 28 ? 3.0 : 0,
        linearAccY: peakLatY,
        yawRate: peakLatY * 0.2 * (inScheivlak ? scheivlakWeakening : 1.0),
        speed: isBraking ? 38 : apexG > 0 ? 45 : 65,
      }));
      ts += stepMs;

      // Extra dwell samples in Scheivlak window for slow laps.
      if (inScheivlak && scheivlakExtraDwell > 0) {
        for (let d = 0; d < scheivlakExtraDwell; d++) {
          records.push(makeRecord({
            ts,
            teamId,
            sessionId,
            lat,
            lon,
            linearAccX: 0,
            linearAccY: peakLatY * 0.8,
            yawRate: peakLatY * 0.15,
            speed: 40,
          }));
          ts += stepMs;
        }
      }
    }
  }

  // Close the last lap by crossing start/finish one more time.
  records.push(makeRecord({
    ts,
    teamId,
    sessionId,
    lat: START_FINISH.lat,
    lon: START_FINISH.lon,
    linearAccX: 0,
    linearAccY: 0,
    yawRate: 0,
    speed: 60,
  }));

  return records;
}

interface MakeArgs {
  ts: number;
  teamId: number;
  sessionId: number;
  lat: number;
  lon: number;
  linearAccX: number;
  linearAccY: number;
  yawRate: number;
  speed: number;
}

function makeRecord(a: MakeArgs): TelemetryRecord {
  return {
    timestamp: a.ts,
    team_id: a.teamId,
    session_id: a.sessionId,
    latitude: a.lat,
    longitude: a.lon,
    altitude: 0,
    speed: a.speed,
    course: 0,
    satellites: 10,
    gps_timestamp: a.ts,
    acc_x: 0, acc_y: 0, acc_z: 9.81,
    gyro_x: 0, gyro_y: 0, gyro_z: a.yawRate,
    mag_x: 0, mag_y: 0, mag_z: 0,
    status_sys: 3, status_gyro: 3, status_acc: 3, status_mag: 3,
    pitch_rate: 0, roll_rate: 0, yaw_rate: a.yawRate,
    pitch_angle: 0, roll_angle: 0, yaw_angle: 0,
    temperature: 22,
    gravity_x: 0, gravity_y: 0, gravity_z: 9.81,
    abs_orientation_x: 0, abs_orientation_y: 0, abs_orientation_z: 0, abs_orientation_w: 1,
    linear_acc_x: a.linearAccX,
    linear_acc_y: a.linearAccY,
    linear_acc_z: 0,
  };
}
