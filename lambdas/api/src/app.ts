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

async function runQuery(sql: string): Promise<Record<string, string>[]> {
  const client = await getAthenaClient();

  const { QueryExecutionId } = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      ResultConfiguration: { OutputLocation: OUTPUT_LOCATION },
      WorkGroup: "primary",
    })
  );

  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const { QueryExecution } = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId })
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
      new GetQueryResultsCommand({ QueryExecutionId, NextToken: nextToken })
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

export const app = new Hono();

app.get("/api/hello", (c) => {
  return c.json({ message: "Hello from hackathon-team-3!" });
});

// List distinct team IDs present in the table
app.get("/api/devices", async (c) => {
  try {
    const rows = await runQuery(
      `SELECT DISTINCT team_id FROM ${TABLE} ORDER BY team_id`
    );
    return c.json({ devices: rows.map((r) => parseInt(r.team_id, 10)) });
  } catch (err) {
    console.error("GET /api/devices error:", err);
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
    `);
    return c.json({ data: rows.map(parseRow) });
  } catch (err) {
    console.error("GET /api/telemetry/latest error:", err);
    return c.json({ error: "Failed to fetch latest telemetry" }, 500);
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
      `SELECT * FROM ${TABLE} ${where} ORDER BY timestamp DESC LIMIT ${limit}`
    );
    return c.json({ data: rows.map(parseRow) });
  } catch (err) {
    console.error("GET /api/telemetry error:", err);
    return c.json({ error: "Failed to fetch telemetry" }, 500);
  }
});
