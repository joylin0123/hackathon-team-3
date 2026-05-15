import { Hono } from "hono";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { QueryCommandInput } from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.DYNAMO_TABLE_NAME!;
const DEFAULT_TEAM_IDS = [1, 2, 3];

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Simple in-memory TTL cache (same role as the Athena query cache)
type CacheEntry = { value: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function fromCache<T>(key: string): T | undefined {
  const e = cache.get(key);
  if (e && Date.now() < e.expiresAt) return e.value as T;
  cache.delete(key);
  return undefined;
}

function toCache(key: string, value: unknown, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

type Row = Record<string, unknown>;

// Query all records for a team, optionally filtered by since/sessionId, with optional limit.
// Returns newest-first by default (ascending=false).
async function queryTeam(
  teamId: number,
  opts: { since?: number; sessionId?: number; limit?: number; ascending?: boolean } = {}
): Promise<Row[]> {
  const { since, sessionId, ascending = false } = opts;
  const limit = opts.limit;

  // Build KeyConditionExpression — timestamp is a DynamoDB reserved word, alias it
  const keyCond = since !== undefined
    ? "team_id = :tid AND #ts >= :since"
    : "team_id = :tid";

  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, unknown> = { ":tid": teamId };
  if (since !== undefined) {
    exprNames["#ts"] = "timestamp";
    exprValues[":since"] = since;
  }

  let filterExpr: string | undefined;
  if (sessionId !== undefined) {
    exprValues[":sid"] = sessionId;
    filterExpr = "session_id = :sid";
  }

  const params: QueryCommandInput = {
    TableName: TABLE,
    KeyConditionExpression: keyCond,
    ExpressionAttributeValues: exprValues,
    ...(Object.keys(exprNames).length > 0 && { ExpressionAttributeNames: exprNames }),
    ScanIndexForward: ascending,
    ...(limit !== undefined && { Limit: limit }),
    ...(filterExpr !== undefined && { FilterExpression: filterExpr }),
  };

  const items: Row[] = [];
  let lastKey: Row | undefined;
  do {
    const result = await dynamo.send(new QueryCommand({ ...params, ExclusiveStartKey: lastKey }));
    items.push(...(result.Items ?? []) as Row[]);
    lastKey = result.LastEvaluatedKey as Row | undefined;
  } while (lastKey && limit === undefined); // paginate fully only when no limit

  return items;
}

// Scan the table for distinct team IDs (result cached 60 s)
async function getTeamIds(): Promise<number[]> {
  const cached = fromCache<number[]>("team_ids");
  if (cached) return cached;

  const teamIdSet = new Set<number>();
  let lastKey: Row | undefined;
  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: "team_id",
      ExclusiveStartKey: lastKey,
    }));
    for (const item of (result.Items ?? [])) {
      const tid = Number((item as Row).team_id);
      if (Number.isFinite(tid) && tid > 0) teamIdSet.add(tid);
    }
    lastKey = result.LastEvaluatedKey as Row | undefined;
  } while (lastKey);

  const ids = teamIdSet.size > 0
    ? Array.from(teamIdSet).sort((a, b) => a - b)
    : DEFAULT_TEAM_IDS;
  toCache("team_ids", ids, 60_000);
  return ids;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown): number { return Number(v) || 0; }
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function parseOptionalInt(value: string | undefined, name: string): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${name}`);
  return parsed;
}

function parseAnalyticsParams(c: any) {
  const teamId = parseOptionalInt(c.req.query("team_id"), "team_id");
  const sessionId = parseOptionalInt(c.req.query("session_id"), "session_id");
  const sinceRaw = c.req.query("since");
  const sinceMs: number | null = sinceRaw ? Number(sinceRaw) : null;
  if (sinceMs !== null && (!Number.isFinite(sinceMs) || sinceMs < 0)) {
    throw new Error("Invalid since");
  }
  return { teamId, sessionId, sinceMs };
}

// ── routes ───────────────────────────────────────────────────────────────────

export const app = new Hono();

app.get("/api/hello", (c) => c.json({ message: "Hello from hackathon-team-3!" }));

// List distinct team IDs present in the table
app.get("/api/devices", async (c) => {
  try {
    const teams = await getTeamIds();
    return c.json({ devices: teams });
  } catch (err) {
    console.error("GET /api/devices error:", err);
    return c.json({ devices: DEFAULT_TEAM_IDS, degraded: true });
  }
});

// Most recent reading per team — useful for a live overview
app.get("/api/telemetry/latest", async (c) => {
  try {
    const teamIds = await getTeamIds();
    const latest = await Promise.all(
      teamIds.map(async (tid) => {
        const rows = await queryTeam(tid, { limit: 1, ascending: false });
        return rows[0] ?? null;
      })
    );
    return c.json({ data: latest.filter(Boolean) });
  } catch (err) {
    console.error("GET /api/telemetry/latest error:", err);
    return c.json({ data: [] }, 500);
  }
});

// Live fast-path — latest N records for a team
// ?team_id=3  ?limit=10
app.get("/api/live", async (c) => {
  const teamIdRaw = c.req.query("team_id");
  const limitRaw = c.req.query("limit");

  const teamId = teamIdRaw ? parseInt(teamIdRaw, 10) : null;
  if (!teamId || isNaN(teamId) || teamId < 0) {
    return c.json({ error: "Invalid or missing team_id" }, 400);
  }
  const limit = Math.min(parseInt(limitRaw ?? "10", 10) || 10, 50);

  try {
    const records = await queryTeam(teamId, { limit, ascending: false });
    return c.json({ data: records });
  } catch (err) {
    console.error("GET /api/live error:", err);
    return c.json({ data: [] }, 500);
  }
});

// Historical telemetry with optional filters
// ?team_id=3  ?since=<ms>  ?limit=N
app.get("/api/telemetry", async (c) => {
  const teamIdRaw = c.req.query("team_id");
  const sinceRaw = c.req.query("since");
  const limitRaw = c.req.query("limit");

  const teamId = teamIdRaw ? parseInt(teamIdRaw, 10) : null;
  if (teamIdRaw && (isNaN(teamId!) || teamId! < 0)) {
    return c.json({ error: "Invalid team_id (must be a positive integer)" }, 400);
  }

  const limit = Math.min(parseInt(limitRaw ?? "100", 10) || 100, 1000);
  const sinceMs = sinceRaw ? Number(sinceRaw) : undefined;
  if (sinceRaw && (!Number.isFinite(sinceMs!) || sinceMs! < 0)) {
    return c.json({ error: "Invalid since (must be ms epoch timestamp)" }, 400);
  }

  try {
    let records: Row[];
    if (teamId !== null) {
      records = await queryTeam(teamId, { since: sinceMs, limit, ascending: false });
    } else {
      // No team filter — query all known teams and merge
      const teamIds = await getTeamIds();
      const all = await Promise.all(
        teamIds.map((tid) => queryTeam(tid, { since: sinceMs, limit, ascending: false }))
      );
      records = all.flat()
        .sort((a, b) => num(b.timestamp) - num(a.timestamp))
        .slice(0, limit);
    }
    return c.json({ data: records });
  } catch (err) {
    console.error("GET /api/telemetry error:", err);
    return c.json({ data: [] }, 500);
  }
});

// ── analytics (aggregated in-memory from DynamoDB) ───────────────────────────

app.get("/api/analytics/summary", async (c) => {
  try {
    const { teamId, sessionId, sinceMs } = parseAnalyticsParams(c);
    const cacheKey = `summary:${teamId}:${sessionId}:${sinceMs}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return c.json(cached);

    const records = teamId !== null
      ? await queryTeam(teamId, { sessionId: sessionId ?? undefined, since: sinceMs ?? undefined })
      : (await Promise.all((await getTeamIds()).map((tid) => queryTeam(tid, { since: sinceMs ?? undefined })))).flat();

    const sampleCount = records.length;
    const empty = {
      sample_count: 0, top_speed: 0, avg_speed: 0,
      started_at: null, ended_at: null, confidence_score: 0,
      current_lap: null, best_lap: null, theoretical_best: null, cleanest_lap: null,
    };
    if (sampleCount === 0) return c.json(empty);

    const speeds = records.map((r) => num(r.speed));
    const sats = records.map((r) => num(r.satellites));
    const cals = records.map((r) =>
      (num(r.status_sys) + num(r.status_gyro) + num(r.status_acc) + num(r.status_mag)) / 4
    );
    const timestamps = records.map((r) => num(r.timestamp));
    const avgSat = avg(sats);
    const avgCal = avg(cals);
    const confidenceScore = Math.max(
      0, Math.min(100, (avgSat / 8) * 45 + (avgCal / 3) * 35 + Math.min(sampleCount, 200) / 10)
    );

    const result = {
      sample_count: sampleCount,
      top_speed: Math.max(...speeds),
      avg_speed: avg(speeds),
      started_at: Math.min(...timestamps),
      ended_at: Math.max(...timestamps),
      confidence_score: confidenceScore,
      current_lap: null, best_lap: null, theoretical_best: null, cleanest_lap: null,
    };
    toCache(cacheKey, result, 15_000);
    return c.json(result);
  } catch (err) {
    console.error("GET /api/analytics/summary error:", err);
    return c.json({ error: "Failed to fetch analytics summary" }, 500);
  }
});

app.get("/api/analytics/heatmap", async (c) => {
  try {
    const { teamId, sessionId } = parseAnalyticsParams(c);
    const bins = Math.max(10, Math.min(parseInt(c.req.query("bins") ?? "80", 10) || 80, 120));
    const cacheKey = `heatmap:${teamId}:${sessionId}:${bins}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return c.json(cached);

    const records = teamId !== null
      ? await queryTeam(teamId, { sessionId: sessionId ?? undefined })
      : (await Promise.all((await getTeamIds()).map((tid) => queryTeam(tid)))).flat();

    if (records.length === 0) return c.json({ bins: [] });

    // Sort oldest-first so NTILE-equivalent chunking follows lap order
    const sorted = [...records].sort((a, b) => num(a.timestamp) - num(b.timestamp));
    const chunkSize = Math.ceil(sorted.length / bins);

    const result = Array.from({ length: bins }, (_, i) => {
      const chunk = sorted.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length === 0) return null;
      const speeds = chunk.map((r) => num(r.speed));
      const lats = chunk.map((r) => num(r.latitude)).filter(Boolean);
      const lngs = chunk.map((r) => num(r.longitude)).filter(Boolean);
      return {
        index: i,
        track_position: (i + 0.5) / bins,
        avg_speed: avg(speeds),
        max_speed: Math.max(...speeds),
        avg_lateral_g: avg(chunk.map((r) => Math.abs(num(r.acc_y)) / 9.81)),
        max_braking_g: Math.max(...chunk.map((r) => Math.max(0, -num(r.linear_acc_x) / 9.81))),
        sample_count: chunk.length,
        latitude: lats.length > 0 ? avg(lats) : null,
        longitude: lngs.length > 0 ? avg(lngs) : null,
      };
    }).filter(Boolean);

    const response = { bins: result };
    toCache(cacheKey, response, 15_000);
    return c.json(response);
  } catch (err) {
    console.error("GET /api/analytics/heatmap error:", err);
    return c.json({ error: "Failed to fetch heatmap analytics" }, 500);
  }
});

app.get("/api/analytics/events", async (c) => {
  try {
    const { teamId, sessionId, sinceMs } = parseAnalyticsParams(c);
    const records = teamId !== null
      ? await queryTeam(teamId, { sessionId: sessionId ?? undefined, since: sinceMs ?? undefined, limit: 500 })
      : (await Promise.all(
          (await getTeamIds()).map((tid) => queryTeam(tid, { since: sinceMs ?? undefined, limit: 500 }))
        )).flat().slice(0, 500);

    const events = records.flatMap((r, i) => {
      const lateralG = Math.abs(num(r.acc_y) / 9.81);
      const brakingG = Math.max(0, -(num(r.linear_acc_x ?? r.acc_x) / 9.81));
      const yawRate = Math.abs(num(r.yaw_rate));
      const weakGps = num(r.satellites) > 0 && num(r.satellites) < 5;
      const weakImu = [r.status_sys, r.status_gyro, r.status_acc, r.status_mag]
        .some((v) => (num(v) || 3) < 2);
      const hits = [
        lateralG > 0.55 ? "high lateral load" : null,
        brakingG > 0.45 ? "harsh braking" : null,
        yawRate > 0.75 ? "yaw spike / spin risk" : null,
        weakGps ? "low GPS satellites" : null,
        weakImu ? "IMU calibration degraded" : null,
      ].filter(Boolean);
      if (hits.length === 0) return [];
      return [{
        id: `${num(r.timestamp)}-${i}`,
        timestamp: num(r.timestamp),
        severity: yawRate > 1 || weakGps || weakImu ? "warning" : "info",
        title: hits[0],
        corner: "Track",
        likely_cause: hits.join(" + "),
        evidence: hits,
        confidence: weakGps || weakImu ? 62 : 78,
      }];
    }).slice(0, 50);

    return c.json({ events });
  } catch (err) {
    console.error("GET /api/analytics/events error:", err);
    return c.json({ error: "Failed to fetch analytics events" }, 500);
  }
});

app.get("/api/analytics/runs", async (c) => {
  try {
    const { teamId, sessionId } = parseAnalyticsParams(c);
    const cacheKey = `runs:${teamId}:${sessionId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return c.json(cached);

    const records = teamId !== null
      ? await queryTeam(teamId, { sessionId: sessionId ?? undefined })
      : (await Promise.all((await getTeamIds()).map((tid) => queryTeam(tid)))).flat();

    const bySession = new Map<number, Row[]>();
    for (const r of records) {
      const sid = num(r.session_id);
      const bucket = bySession.get(sid) ?? [];
      bucket.push(r);
      bySession.set(sid, bucket);
    }

    const runs = Array.from(bySession.entries()).map(([sid, rows]) => {
      const speeds = rows.map((r) => num(r.speed));
      const timestamps = rows.map((r) => num(r.timestamp));
      return {
        session_id: sid,
        sample_count: rows.length,
        top_speed: Math.max(...speeds),
        avg_speed: avg(speeds),
        confidence_score: Math.min(100, (avg(rows.map((r) => num(r.satellites))) / 8) * 100),
        started_at: Math.min(...timestamps),
        ended_at: Math.max(...timestamps),
      };
    }).sort((a, b) => b.top_speed - a.top_speed);

    const response = { runs };
    toCache(cacheKey, response, 30_000);
    return c.json(response);
  } catch (err) {
    console.error("GET /api/analytics/runs error:", err);
    return c.json({ error: "Failed to fetch run analytics" }, 500);
  }
});

app.get("/api/analytics/sensor-health", async (c) => {
  try {
    const { sessionId } = parseAnalyticsParams(c);
    const cacheKey = `sensor-health:${sessionId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return c.json(cached);

    const teamIds = await getTeamIds();
    const sensors = await Promise.all(
      teamIds.map(async (tid) => {
        const rows = await queryTeam(tid, { sessionId: sessionId ?? undefined });
        if (rows.length === 0) return null;
        const avgSat = avg(rows.map((r) => num(r.satellites)));
        const avgCal = avg(rows.map((r) =>
          (num(r.status_sys) + num(r.status_gyro) + num(r.status_acc) + num(r.status_mag)) / 4
        ));
        const timestamps = rows.map((r) => num(r.timestamp));
        const gpsScore = Math.min(100, (avgSat / 8) * 100);
        const imuScore = Math.min(100, (avgCal / 3) * 100);
        const confidenceScore = gpsScore * 0.55 + imuScore * 0.45;
        return {
          team_id: tid,
          sample_count: rows.length,
          gps_score: gpsScore,
          imu_score: imuScore,
          confidence_score: confidenceScore,
          started_at: Math.min(...timestamps),
          latest_at: Math.max(...timestamps),
          status: confidenceScore >= 75 ? "good" : confidenceScore >= 45 ? "watch" : "poor",
        };
      })
    );

    const response = { sensors: sensors.filter(Boolean) };
    toCache(cacheKey, response, 30_000);
    return c.json(response);
  } catch (err) {
    console.error("GET /api/analytics/sensor-health error:", err);
    return c.json({ error: "Failed to fetch sensor health" }, 500);
  }
});
