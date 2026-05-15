import type {
  DevicesResponse,
  SessionSummary,
  SessionsResponse,
  TelemetryRecord,
  TelemetryResponse,
} from '../types/telemetry';

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

export async function fetchDevices(): Promise<number[]> {
  const res = await fetch(`${BASE}/api/devices`);
  if (!res.ok) throw new Error(`fetchDevices: ${res.status}`);
  const json: DevicesResponse = await res.json();
  return json.devices;
}

export async function fetchLatestTelemetry(): Promise<TelemetryRecord[]> {
  const res = await fetch(`${BASE}/api/telemetry/latest`);
  if (!res.ok) throw new Error(`fetchLatestTelemetry: ${res.status}`);
  const json: TelemetryResponse = await res.json();
  return json.data;
}

export async function fetchLiveTelemetry(team_id: number, limit = 10): Promise<TelemetryRecord[]> {
  const url = new URL(`${BASE}/api/live`);
  url.searchParams.set('team_id', String(team_id));
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`fetchLiveTelemetry: ${res.status}`);
  const json: TelemetryResponse = await res.json();
  return json.data;
}

export async function fetchSessions(team_id?: number): Promise<SessionSummary[]> {
  const url = new URL(`${BASE}/api/sessions`);
  if (team_id !== undefined) url.searchParams.set('team_id', String(team_id));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`fetchSessions: ${res.status}`);
  const json: SessionsResponse = await res.json();
  return json.sessions;
}

export async function fetchTelemetry(params: {
  team_id?: number;
  session_id?: number;
  since?: number;
  limit?: number;
}): Promise<TelemetryRecord[]> {
  const url = new URL(`${BASE}/api/telemetry`);
  if (params.team_id !== undefined) url.searchParams.set('team_id', String(params.team_id));
  if (params.session_id !== undefined) url.searchParams.set('session_id', String(params.session_id));
  if (params.since !== undefined) url.searchParams.set('since', String(params.since));
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`fetchTelemetry: ${res.status}`);
  const json: TelemetryResponse = await res.json();
  return json.data;
}
