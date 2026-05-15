export interface TelemetryRecord {
  timestamp: number;
  team_id: number;
  session_id: number;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number; // km/h
  course: number; // degrees 0-360
  satellites: number;
  gps_timestamp: number;
  acc_x: number;
  acc_y: number;
  acc_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  mag_x: number;
  mag_y: number;
  mag_z: number;
  status_sys: number;
  status_gyro: number;
  status_acc: number;
  status_mag: number;
  pitch_rate: number;
  roll_rate: number;
  yaw_rate: number;
  pitch_angle: number;
  roll_angle: number;
  yaw_angle: number;
  temperature: number;
  gravity_x: number;
  gravity_y: number;
  gravity_z: number;
  abs_orientation_w?: number;
  abs_orientation_x: number;
  abs_orientation_y: number;
  abs_orientation_z: number;
  linear_acc_x: number;
  linear_acc_y: number;
  linear_acc_z: number;
}

export interface DevicesResponse {
  devices: number[];
}

export interface TelemetryResponse {
  data: TelemetryRecord[];
}

export interface SessionSummary {
  session_id: number;
  team_id: number;
  sample_count: number;
  started_at: number;
  ended_at: number;
}

export interface SessionsResponse {
  sessions: SessionSummary[];
}

export interface LapInfo {
  lapNumber: number;
  startTimestamp: number;
  endTimestamp: number | null;
  lapTimeMs: number | null;
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
  topSpeed: number;
}

export interface DeviationPoint {
  trackPosition: number; // 0-1 normalized position along ideal line
  distanceMeters: number;
  timestamp: number;
  speed: number;
  nearestTurn?: string;
}
