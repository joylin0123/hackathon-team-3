import { classifyDrivingState, type DrivingState } from './CauseLocalizer';
import type { TelemetryRecord } from '../types/telemetry';

export const STATE_COLOR: Record<DrivingState, string> = {
  braking: '#ef4444',
  cornering: '#facc15',
  full_throttle: '#35fdad',
  coasting: '#94a3b8',
};

export const STATE_LABEL: Record<DrivingState, string> = {
  braking: 'Braking',
  cornering: 'Cornering',
  full_throttle: 'Full throttle',
  coasting: 'Coasting',
};

export interface DriverStateMarker {
  lat: number;
  lon: number;
  state: DrivingState;
  color: string;
}

export function classifyRecord(r: TelemetryRecord): DrivingState {
  return classifyDrivingState(r);
}

export function sampleDriverStateMarkers(
  records: TelemetryRecord[],
  everyN = 8,
): DriverStateMarker[] {
  if (records.length === 0) return [];
  const step = Math.max(1, everyN);
  const out: DriverStateMarker[] = [];
  for (let i = 0; i < records.length; i += step) {
    const r = records[i];
    if (r.latitude == null || r.longitude == null) continue;
    if (r.linear_acc_x == null || r.linear_acc_y == null) continue;
    const state = classifyRecord(r);
    out.push({ lat: r.latitude, lon: r.longitude, state, color: STATE_COLOR[state] });
  }
  return out;
}

export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b, alpha];
}
