import type { SQSEvent } from "aws-lambda";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
} from "@aws-sdk/client-athena";

const SHARED_ROLE_ARN = process.env.SHARED_ROLE_ARN!;
const ATHENA_OUTPUT_LOCATION = process.env.SHARED_ATHENA_OUTPUT_LOCATION!;
const ATHENA_CATALOG = process.env.ATHENA_CATALOG!;
const ATHENA_DATABASE = process.env.ATHENA_DATABASE!;
const TABLE_NAME = process.env.TABLE_NAME!;

// Quoted because the catalog path contains "/" — unquoted yields TABLE_NOT_FOUND
const TABLE_PATH = `"s3tablescatalog/${ATHENA_CATALOG}".${ATHENA_DATABASE}.${TABLE_NAME}`;

const sts = new STSClient();

let cachedClient: AthenaClient | null = null;
let credentialsExpireAt = 0;

// Reused across warm invocations; re-assumes only when the temp credentials near expiry
async function getAthenaClient(): Promise<AthenaClient> {
  const now = Date.now();
  if (cachedClient && now < credentialsExpireAt - 60_000) return cachedClient;

  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: SHARED_ROLE_ARN,
      RoleSessionName: "iot-processor",
    }),
  );
  if (
    !Credentials?.AccessKeyId ||
    !Credentials.SecretAccessKey ||
    !Credentials.SessionToken
  ) {
    throw new Error("AssumeRole returned incomplete credentials");
  }

  cachedClient = new AthenaClient({
    credentials: {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    },
  });
  credentialsExpireAt = Credentials.Expiration?.getTime() ?? now + 3_600_000;
  return cachedClient;
}

async function runQuery(client: AthenaClient, sql: string): Promise<string> {
  const { QueryExecutionId } = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      ResultConfiguration: { OutputLocation: ATHENA_OUTPUT_LOCATION },
      WorkGroup: "primary",
    }),
  );
  if (!QueryExecutionId) throw new Error("StartQueryExecution returned no id");

  while (true) {
    const { QueryExecution } = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId }),
    );
    const state = QueryExecution?.Status?.State;
    if (state === "SUCCEEDED") return QueryExecutionId;
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(
        `Athena query ${state}: ${QueryExecution?.Status?.StateChangeReason ?? "unknown reason"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// Shared cross-team telemetry schema, in the table's column order. The INSERT names
// these explicitly, so this order only has to be internally consistent — not match
// the table's physical column order.
const COLUMNS = [
  "timestamp", "team_id", "session_id",
  "latitude", "longitude", "altitude", "speed", "course", "satellites", "gps_timestamp",
  "acc_x", "acc_y", "acc_z",
  "gyro_x", "gyro_y", "gyro_z",
  "mag_x", "mag_y", "mag_z",
  "status_mag", "status_gyro", "status_acc", "status_sys",
  "pitch_rate", "roll_rate", "yaw_rate",
  "pitch_angle", "roll_angle", "yaw_angle",
  "temperature",
  "gravity_x", "gravity_y", "gravity_z",
  "abs_orientation_x", "abs_orientation_y", "abs_orientation_z", "abs_orientation_w",
  "linear_acc_x", "linear_acc_y", "linear_acc_z",
] as const;

// Columns the shared table types as integers — sensor sources (NMEA course, fix
// counts, BNO055 calibration levels) can arrive as floats, so these are rounded.
const INTEGER_COLUMNS = new Set<string>([
  "timestamp", "team_id", "session_id", "course", "satellites", "gps_timestamp",
  "status_mag", "status_gyro", "status_acc", "status_sys",
]);

// Map one telemetry message to a SQL "(v, v, ...)" tuple in COLUMNS order. Every
// column is numeric; absent or non-finite values become the SQL literal NULL.
function toValuesTuple(msg: any): string {
  if (typeof msg !== "object" || msg === null) {
    throw new Error("Telemetry message is not a JSON object");
  }
  const values = COLUMNS.map((col) => {
    const raw = msg[col];
    if (raw === null || raw === undefined) return "NULL";
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return "NULL";
    return String(INTEGER_COLUMNS.has(col) ? Math.round(n) : n);
  });
  return `(${values.join(", ")})`;
}

export const handler = async (event: SQSEvent) => {
  console.log("Received SQS event with", event.Records.length, "messages");

  const tuples: string[] = [];
  for (const record of event.Records) {
    try {
      tuples.push(toValuesTuple(JSON.parse(record.body)));
    } catch (error) {
      console.error("Skipping bad SQS message:", error);
      continue;
    }
  }

  if (tuples.length === 0) {
    return { statusCode: 200, message: "No rows to insert" };
  }

  // One multi-row INSERT per batch — Athena writes a new S3 file per INSERT, so never insert per-message
  const sql = `INSERT INTO ${TABLE_PATH} (${COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}`;
  await runQuery(await getAthenaClient(), sql);

  console.log("Inserted", tuples.length, "rows into", TABLE_NAME);
  return { statusCode: 200, message: "Batch processed successfully" };
};
