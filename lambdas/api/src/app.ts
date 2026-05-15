import { Hono } from "hono";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from "@aws-sdk/client-athena";

const ROLE_ARN = process.env.SHARED_ROLE_ARN!;
const OUTPUT_LOCATION = process.env.SHARED_ATHENA_OUTPUT_LOCATION!;
const TABLE = `"s3tablescatalog/${process.env.ATHENA_CATALOG}".${process.env.ATHENA_DATABASE}.${process.env.TABLE_NAME}`;

let cachedClient: AthenaClient | null = null;
let clientExpiry = 0;

type QueryCacheEntry = {
  rows: Record<string, string>[];
  expiresAt: number;
};

const DEFAULT_DEVICES = [1, 2, 3];
const ATHENA_START_RETRY_DELAYS_MS = [250, 750, 1500, 3000, 5000, 7500];
const queryCache = new Map<string, QueryCacheEntry>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAthenaConcurrencyError(err: unknown): boolean {
  const error = err as {
    name?: string;
    Reason?: string;
    __type?: string;
    message?: string;
  };
  return (
    error?.Reason === "CONCURRENT_QUERY_LIMIT_EXCEEDED" ||
    error?.name === "TooManyRequestsException" ||
    error?.__type === "TooManyRequestsException" ||
    /CONCURRENT_QUERY_LIMIT_EXCEEDED|concurrent quer/i.test(error?.message ?? "")
  );
}

async function getAthenaClient(): Promise<AthenaClient> {
  if (cachedClient && Date.now() < clientExpiry) {
    return cachedClient;
  }
  const sts = new STSClient({});
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: ROLE_ARN,
      RoleSessionName: "hackathon-api",
      DurationSeconds: 3600,
    })
  );
  cachedClient = new AthenaClient({
    credentials: {
      accessKeyId: Credentials!.AccessKeyId!,
      secretAccessKey: Credentials!.SecretAccessKey!,
      sessionToken: Credentials!.SessionToken,
    },
  });
  clientExpiry = Credentials!.Expiration!.getTime() - 5 * 60 * 1000;
  return cachedClient;
}

async function runQuery(
  sql: string,
  options: { cacheTtlMs?: number } = {}
): Promise<Record<string, string>[]> {
  const cached = queryCache.get(sql);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.rows;
  }

  const client = await getAthenaClient();

  let queryExecutionId: string | undefined;
  for (let attempt = 0; attempt <= ATHENA_START_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { QueryExecutionId } = await client.send(
        new StartQueryExecutionCommand({
          QueryString: sql,
          ResultConfiguration: { OutputLocation: OUTPUT_LOCATION },
          WorkGroup: "primary",
        })
      );
      queryExecutionId = QueryExecutionId;
      break;
    } catch (err) {
      if (!isAthenaConcurrencyError(err)) throw err;
      const delay = ATHENA_START_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        if (cached) return cached.rows;
        throw err;
      }
      await sleep(delay);
    }
  }

  if (!queryExecutionId) {
    throw new Error("Athena query did not return a QueryExecutionId");
  }

  for (;;) {
    await sleep(500);
    const { QueryExecution } = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );
    const state = QueryExecution?.Status?.State;
    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(
        `Athena query ${state}: ${QueryExecution?.Status?.StateChangeReason}`
      );
    }
  }

  const rows: Record<string, string>[] = [];
  let nextToken: string | undefined;
  let columns: string[] = [];
  let firstPage = true;

  do {
    const { ResultSet, NextToken } = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        NextToken: nextToken,
      })
    );
    if (firstPage) {
      columns = (ResultSet?.ResultSetMetadata?.ColumnInfo ?? []).map(
        (c) => c.Name!
      );
    }
    const pageRows = ResultSet?.Rows ?? [];
    for (let i = firstPage ? 1 : 0; i < pageRows.length; i++) {
      const row: Record<string, string> = {};
      pageRows[i].Data?.forEach((cell, j) => {
        row[columns[j]] = cell.VarCharValue ?? "";
      });
      rows.push(row);
    }
    nextToken = NextToken;
    firstPage = false;
  } while (nextToken);

  if (options.cacheTtlMs && options.cacheTtlMs > 0) {
    queryCache.set(sql, {
      rows,
      expiresAt: Date.now() + options.cacheTtlMs,
    });
  }

  return rows;
}

// Athena returns all values as strings; convert known numeric fields back.
function parseRow(row: Record<string, string>): Record<string, unknown> {
  const num = (v: string | undefined) =>
    v !== undefined && v !== "" ? parseFloat(v) : null;
  const int = (v: string | undefined) =>
    v !== undefined && v !== "" ? parseInt(v, 10) : null;
  return {
    ...row,
    team_id: int(row.team_id),
    session_id: int(row.session_id),
    timestamp: int(row.timestamp),
    gps_timestamp: int(row.gps_timestamp),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    altitude: num(row.altitude),
    speed: num(row.speed),
    course: num(row.course),
    satellites: int(row.satellites),
    acc_x: num(row.acc_x),
    acc_y: num(row.acc_y),
    acc_z: num(row.acc_z),
    gyro_x: num(row.gyro_x),
    gyro_y: num(row.gyro_y),
    gyro_z: num(row.gyro_z),
    mag_x: num(row.mag_x),
    mag_y: num(row.mag_y),
    mag_z: num(row.mag_z),
    status_mag: int(row.status_mag),
    status_gyro: int(row.status_gyro),
    status_acc: int(row.status_acc),
    status_sys: int(row.status_sys),
    pitch_rate: num(row.pitch_rate),
    roll_rate: num(row.roll_rate),
    yaw_rate: num(row.yaw_rate),
    pitch_angle: num(row.pitch_angle),
    roll_angle: num(row.roll_angle),
    yaw_angle: num(row.yaw_angle),
    temperature: num(row.temperature),
    gravity_x: num(row.gravity_x),
    gravity_y: num(row.gravity_y),
    gravity_z: num(row.gravity_z),
    abs_orientation_x: num(row.abs_orientation_x),
    abs_orientation_y: num(row.abs_orientation_y),
    abs_orientation_z: num(row.abs_orientation_z),
    linear_acc_x: num(row.linear_acc_x),
    linear_acc_y: num(row.linear_acc_y),
    linear_acc_z: num(row.linear_acc_z),
  };
}

function parseOptionalInt(value: string | undefined, name: string): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}`);
  }
  return parsed;
}

function analyticsWhere(teamId: number | null, sessionId: number | null, sinceMs?: number | null) {
  const conditions: string[] = [];
  if (teamId !== null) conditions.push(`team_id = ${teamId}`);
  if (sessionId !== null) conditions.push(`session_id = ${sessionId}`);
  if (sinceMs !== null && sinceMs !== undefined) conditions.push(`timestamp >= ${sinceMs}`);
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
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

export const app = new Hono();

app.get("/api/hello", (c) => {
  return c.json({ message: "Hello from hackathon-team-3!" });
});

// List distinct team IDs present in the table
app.get("/api/devices", async (c) => {
  try {
    const rows = await runQuery(
      `SELECT DISTINCT team_id FROM ${TABLE} ORDER BY team_id`,
      { cacheTtlMs: 60_000 }
    );
    return c.json({ devices: rows.map((r) => parseInt(r.team_id, 10)) });
  } catch (err) {
    console.error("GET /api/devices error:", err);
    if (isAthenaConcurrencyError(err)) {
      return c.json({
        devices: DEFAULT_DEVICES,
        degraded: true,
        reason: "Athena concurrent query limit exceeded",
      });
    }
    return c.json({ error: "Failed to fetch devices" }, 500);
  }
});

// Most recent reading per team — useful for a live map
app.get("/api/telemetry/latest", async (c) => {
  try {
    const rows = await runQuery(`
      SELECT *
      FROM ${TABLE}
      WHERE (team_id, timestamp) IN (
        SELECT team_id, MAX(timestamp) FROM ${TABLE} GROUP BY team_id
      )
      ORDER BY timestamp DESC
    `, { cacheTtlMs: 10_000 });
    return c.json({ data: rows.map(parseRow) });
  } catch (err) {
    console.error("GET /api/telemetry/latest error:", err);
    if (isAthenaConcurrencyError(err)) {
      return c.json({
        data: [],
        degraded: true,
        reason: "Athena concurrent query limit exceeded",
      });
    }
    return c.json({ error: "Failed to fetch latest telemetry" }, 500);
  }
});

app.get("/api/analytics/summary", async (c) => {
  try {
    const { teamId, sessionId } = parseAnalyticsParams(c);
    const where = analyticsWhere(teamId, sessionId);
    const rows = await runQuery(`
      SELECT
        COUNT(*) sample_count,
        MAX(speed) top_speed,
        AVG(speed) avg_speed,
        AVG(satellites) avg_satellites,
        AVG((status_sys + status_gyro + status_acc + status_mag) / 4.0) avg_calibration,
        MIN(timestamp) started_at,
        MAX(timestamp) ended_at
      FROM ${TABLE}
      ${where}
    `, { cacheTtlMs: 15_000 });
    const row = rows[0] ?? {};
    const sampleCount = parseInt(row.sample_count ?? "0", 10) || 0;
    const avgSatellites = parseFloat(row.avg_satellites ?? "0") || 0;
    const avgCalibration = parseFloat(row.avg_calibration ?? "0") || 0;
    const confidenceScore = Math.max(0, Math.min(100, (avgSatellites / 8) * 45 + (avgCalibration / 3) * 35 + Math.min(sampleCount, 200) / 10));
    return c.json({
      sample_count: sampleCount,
      top_speed: parseFloat(row.top_speed ?? "0") || 0,
      avg_speed: parseFloat(row.avg_speed ?? "0") || 0,
      started_at: row.started_at ? parseInt(row.started_at, 10) : null,
      ended_at: row.ended_at ? parseInt(row.ended_at, 10) : null,
      confidence_score: confidenceScore,
      current_lap: null,
      best_lap: null,
      theoretical_best: null,
      cleanest_lap: null,
    });
  } catch (err) {
    console.error("GET /api/analytics/summary error:", err);
    if (isAthenaConcurrencyError(err)) {
      return c.json({
        sample_count: 0,
        top_speed: 0,
        avg_speed: 0,
        started_at: null,
        ended_at: null,
        confidence_score: 0,
        current_lap: null,
        best_lap: null,
        theoretical_best: null,
        cleanest_lap: null,
        degraded: true,
        reason: "Athena concurrent query limit exceeded",
      });
    }
    return c.json({ error: "Failed to fetch analytics summary" }, 500);
  }
});

app.get("/api/analytics/heatmap", async (c) => {
  try {
    const { teamId, sessionId } = parseAnalyticsParams(c);
    const bins = Math.max(10, Math.min(parseInt(c.req.query("bins") ?? "80", 10) || 80, 120));
    const where = analyticsWhere(teamId, sessionId);
    const rows = await runQuery(`
      WITH ordered AS (
        SELECT
          *,
          NTILE(${bins}) OVER (ORDER BY timestamp) AS bin_index
        FROM ${TABLE}
        ${where}
      )
      SELECT
        bin_index - 1 AS bin,
        AVG(speed) avg_speed,
        MAX(speed) max_speed,
        AVG(ABS(acc_y) / 9.81) avg_lateral_g,
        MAX(GREATEST(0, -linear_acc_x / 9.81)) max_braking_g,
        COUNT(*) sample_count,
        AVG(latitude) latitude,
        AVG(longitude) longitude
      FROM ordered
      GROUP BY bin_index
      ORDER BY bin_index
    `, { cacheTtlMs: 15_000 });
    return c.json({
      bins: rows.map((r) => ({
        index: parseInt(r.bin, 10),
        track_position: ((parseInt(r.bin, 10) || 0) + 0.5) / bins,
        avg_speed: parseFloat(r.avg_speed ?? "0") || 0,
        max_speed: parseFloat(r.max_speed ?? "0") || 0,
        avg_lateral_g: parseFloat(r.avg_lateral_g ?? "0") || 0,
        max_braking_g: parseFloat(r.max_braking_g ?? "0") || 0,
        sample_count: parseInt(r.sample_count ?? "0", 10) || 0,
        latitude: parseFloat(r.latitude ?? "0") || null,
        longitude: parseFloat(r.longitude ?? "0") || null,
      })),
    });
  } catch (err) {
    console.error("GET /api/analytics/heatmap error:", err);
    if (isAthenaConcurrencyError(err)) {
      return c.json({
        bins: [],
        degraded: true,
        reason: "Athena concurrent query limit exceeded",
      });
    }
    return c.json({ error: "Failed to fetch heatmap analytics" }, 500);
  }
});

app.get("/api/analytics/events", async (c) => {
  try {
    const { teamId, sessionId, sinceMs } = parseAnalyticsParams(c);
    const where = analyticsWhere(teamId, sessionId, sinceMs);
    const rows = await runQuery(`
      SELECT *
      FROM ${TABLE}
      ${where}
      ORDER BY timestamp DESC
      LIMIT 500
    `, { cacheTtlMs: 10_000 });
    const data = rows.map(parseRow) as any[];
    const events = data.flatMap((r, i) => {
      const lateralG = Math.abs((r.acc_y ?? 0) / 9.81);
      const brakingG = Math.max(0, -((r.linear_acc_x ?? r.acc_x ?? 0) / 9.81));
      const yawRate = Math.abs(r.yaw_rate ?? 0);
      const weakGps = (r.satellites ?? 0) > 0 && (r.satellites ?? 0) < 5;
      const weakImu = [r.status_sys, r.status_gyro, r.status_acc, r.status_mag].some((v) => (v ?? 3) < 2);
      const hits = [
        lateralG > 0.55 ? "high lateral load" : null,
        brakingG > 0.45 ? "harsh braking" : null,
        yawRate > 0.75 ? "yaw spike / spin risk" : null,
        weakGps ? "low GPS satellites" : null,
        weakImu ? "IMU calibration degraded" : null,
      ].filter(Boolean);
      if (hits.length === 0) return [];
      return [{
        id: `${r.timestamp}-${i}`,
        timestamp: r.timestamp,
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
    if (isAthenaConcurrencyError(err)) {
      return c.json({
        events: [],
        degraded: true,
        reason: "Athena concurrent query limit exceeded",
      });
    }
    return c.json({ error: "Failed to fetch analytics events" }, 500);
  }
});

app.get("/api/analytics/runs", async (c) => {
  try {
    const { teamId, sessionId } = parseAnalyticsParams(c);
    const where = analyticsWhere(teamId, sessionId);
    const rows = await runQuery(`
      SELECT
        session_id,
        COUNT(*) sample_count,
        MAX(speed) top_speed,
        AVG(speed) avg_speed,
        AVG(satellites) avg_satellites,
        MIN(timestamp) started_at,
        MAX(timestamp) ended_at
      FROM ${TABLE}
      ${where}
      GROUP BY session_id
      ORDER BY top_speed DESC
    `, { cacheTtlMs: 30_000 });
    return c.json({ runs: rows.map((r) => ({
      session_id: parseInt(r.session_id, 10),
      sample_count: parseInt(r.sample_count, 10),
      top_speed: parseFloat(r.top_speed ?? "0") || 0,
      avg_speed: parseFloat(r.avg_speed ?? "0") || 0,
      confidence_score: Math.min(100, ((parseFloat(r.avg_satellites ?? "0") || 0) / 8) * 100),
      started_at: parseInt(r.started_at, 10),
      ended_at: parseInt(r.ended_at, 10),
    })) });
  } catch (err) {
    console.error("GET /api/analytics/runs error:", err);
    if (isAthenaConcurrencyError(err)) {
      return c.json({
        runs: [],
        degraded: true,
        reason: "Athena concurrent query limit exceeded",
      });
    }
    return c.json({ error: "Failed to fetch run analytics" }, 500);
  }
});

app.get("/api/analytics/sensor-health", async (c) => {
  try {
    const { sessionId } = parseAnalyticsParams(c);
    const where = analyticsWhere(null, sessionId);
    const rows = await runQuery(`
      SELECT
        team_id,
        COUNT(*) sample_count,
        AVG(satellites) avg_satellites,
        AVG((status_sys + status_gyro + status_acc + status_mag) / 4.0) avg_calibration,
        MIN(timestamp) started_at,
        MAX(timestamp) latest_at
      FROM ${TABLE}
      ${where}
      GROUP BY team_id
      ORDER BY team_id
    `, { cacheTtlMs: 30_000 });
    return c.json({ sensors: rows.map((r) => {
      const gpsScore = Math.min(100, ((parseFloat(r.avg_satellites ?? "0") || 0) / 8) * 100);
      const imuScore = Math.min(100, ((parseFloat(r.avg_calibration ?? "0") || 0) / 3) * 100);
      const confidenceScore = gpsScore * 0.55 + imuScore * 0.45;
      return {
        team_id: parseInt(r.team_id, 10),
        sample_count: parseInt(r.sample_count, 10),
        gps_score: gpsScore,
        imu_score: imuScore,
        confidence_score: confidenceScore,
        started_at: parseInt(r.started_at, 10),
        latest_at: parseInt(r.latest_at, 10),
        status: confidenceScore >= 75 ? "good" : confidenceScore >= 45 ? "watch" : "poor",
      };
    }) });
  } catch (err) {
    console.error("GET /api/analytics/sensor-health error:", err);
    if (isAthenaConcurrencyError(err)) {
      return c.json({
        sensors: [],
        degraded: true,
        reason: "Athena concurrent query limit exceeded",
      });
    }
    return c.json({ error: "Failed to fetch sensor health" }, 500);
  }
});

// Historical telemetry with optional filters
// ?team_id=3      filter by team (integer)
// ?since=<ms>     only rows with timestamp >= this value
// ?limit=N        max rows (default 100, max 1000)
app.get("/api/telemetry", async (c) => {
  const teamIdRaw = c.req.query("team_id");
  const sinceRaw = c.req.query("since");
  const limitRaw = c.req.query("limit");

  const teamId = teamIdRaw ? parseInt(teamIdRaw, 10) : null;
  if (teamIdRaw && (isNaN(teamId!) || teamId! < 0)) {
    return c.json({ error: "Invalid team_id (must be a positive integer)" }, 400);
  }

  const limit = Math.min(parseInt(limitRaw ?? "100", 10) || 100, 1000);
  const sinceMs = sinceRaw ? Number(sinceRaw) : null;
  if (sinceRaw && (isNaN(sinceMs!) || sinceMs! < 0)) {
    return c.json({ error: "Invalid since (must be ms epoch timestamp)" }, 400);
  }

  const conditions: string[] = [];
  if (teamId !== null) conditions.push(`team_id = ${teamId}`);
  if (sinceMs !== null) conditions.push(`timestamp >= ${sinceMs}`);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const rows = await runQuery(
      `SELECT * FROM ${TABLE} ${where} ORDER BY timestamp DESC LIMIT ${limit}`,
      { cacheTtlMs: sinceMs === null ? 10_000 : 3_000 }
    );
    return c.json({ data: rows.map(parseRow) });
  } catch (err) {
    console.error("GET /api/telemetry error:", err);
    if (isAthenaConcurrencyError(err)) {
      return c.json({
        data: [],
        degraded: true,
        reason: "Athena concurrent query limit exceeded",
      });
    }
    return c.json({ error: "Failed to fetch telemetry" }, 500);
  }
});
