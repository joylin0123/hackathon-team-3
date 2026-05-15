import type { TelemetryRecord } from '../types/telemetry';
import { pointAtTrackPosition } from './trackAnalytics';

function seededNoise(seed: number) {
  const x = Math.sin(seed * 999.7) * 43758.5453;
  return x - Math.floor(x);
}

function bearingDegrees(a: [number, number], b: [number, number]) {
  const dy = b[0] - a[0];
  const dx = b[1] - a[1];
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

function offsetPoint(point: [number, number], lateralMeters: number, longitudinalMeters: number): [number, number] {
  const metersPerLat = 111_320;
  const metersPerLon = 111_320 * Math.cos(point[0] * Math.PI / 180);
  return [
    point[0] + longitudinalMeters / metersPerLat,
    point[1] + lateralMeters / metersPerLon,
  ];
}

export function buildDemoTelemetry(now = Date.now()): TelemetryRecord[] {
  const records: TelemetryRecord[] = [];
  const sensors = [1, 2, 3];
  const sessions = [101, 102, 103];
  const lapMsBySession = [98_000, 94_000, 96_500];
  const sampleMs = 1_000;
  const baseStart = now - 18 * 60_000;

  sessions.forEach((sessionId, sessionIndex) => {
    const lapMs = lapMsBySession[sessionIndex];
    const sessionStart = baseStart + sessionIndex * 6 * 60_000;
    const samples = Math.floor(lapMs / sampleMs) + 1;

    for (let i = 0; i < samples; i++) {
      const progress = i / (samples - 1);
      const basePoint = pointAtTrackPosition(progress);
      const nextPoint = pointAtTrackPosition(Math.min(1, progress + 0.005));
      const course = bearingDegrees(basePoint, nextPoint);
      const cornerLoad = Math.abs(Math.sin(progress * Math.PI * 8));
      const brakingZone = progress > 0.06 && progress < 0.12 || progress > 0.53 && progress < 0.6 || progress > 0.8 && progress < 0.88;
      const speedBase = Math.max(45, 178 - cornerLoad * 72 - (brakingZone ? 32 : 0) + sessionIndex * 4);

      sensors.forEach((sensorId) => {
        const drift = (sensorId - 2) * 1.8 + (seededNoise(i + sensorId * 19 + sessionIndex * 101) - 0.5) * 2.4;
        const longitudinalDrift = (seededNoise(i * 3 + sensorId) - 0.5) * 1.5;
        const [latitude, longitude] = offsetPoint(basePoint, drift, longitudinalDrift);
        const timestamp = sessionStart + i * sampleMs + sensorId * 70;
        const speed = speedBase + (seededNoise(i + sensorId * 7) - 0.5) * 7 - (sensorId === 3 && sessionIndex === 1 ? 4 : 0);
        const lateralG = cornerLoad * 0.82 + (seededNoise(i * 5 + sensorId) - 0.5) * 0.08;
        const longG = brakingZone ? -0.5 + (seededNoise(i * 11 + sensorId) - 0.5) * 0.12 : 0.16 + (seededNoise(i * 13 + sensorId) - 0.5) * 0.08;
        const yawRate = cornerLoad * 0.55 + (sensorId === 2 && progress > 0.52 && progress < 0.56 ? 0.45 : 0);
        const weakSensor = sensorId === 3 && sessionIndex === 2;

        records.push({
          timestamp,
          team_id: sensorId,
          session_id: sessionId,
          latitude,
          longitude,
          altitude: 6 + sessionIndex,
          speed,
          course,
          satellites: weakSensor ? 4 : 8 + Math.round(seededNoise(i + sensorId) * 3),
          gps_timestamp: timestamp,
          acc_x: longG * 9.81,
          acc_y: lateralG * 9.81,
          acc_z: 9.81,
          gyro_x: 0.01,
          gyro_y: 0.02,
          gyro_z: yawRate,
          mag_x: 12,
          mag_y: 8,
          mag_z: 36,
          status_sys: weakSensor ? 1 : 3,
          status_gyro: weakSensor ? 2 : 3,
          status_acc: weakSensor ? 1 : 3,
          status_mag: weakSensor ? 1 : 3,
          pitch_rate: 0.02,
          roll_rate: 0.01,
          yaw_rate: yawRate,
          pitch_angle: longG * 0.04,
          roll_angle: lateralG * 0.09,
          yaw_angle: course * Math.PI / 180,
          temperature: 29 + sessionIndex + sensorId * 0.2,
          gravity_x: 0,
          gravity_y: 0,
          gravity_z: 9.81,
          abs_orientation_w: 1,
          abs_orientation_x: 0,
          abs_orientation_y: 0,
          abs_orientation_z: 0,
          linear_acc_x: longG * 9.81,
          linear_acc_y: lateralG * 9.81,
          linear_acc_z: 0,
        });
      });
    }
  });

  return records.sort((a, b) => a.timestamp - b.timestamp);
}
