import type { SQSEvent } from "aws-lambda";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

// ── DynamoDB (fast path) ──────────────────────────────────────────────────────

const DYNAMO_TABLE = process.env.DYNAMO_TABLE_NAME!;
const TTL_SECONDS = 7 * 24 * 3600;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ── Athena (S3 archive) ───────────────────────────────────────────────────────

const SHARED_ROLE_ARN = process.env.SHARED_ROLE_ARN!;
const ATHENA_OUTPUT_LOCATION = process.env.SHARED_ATHENA_OUTPUT_LOCATION!;
const ATHENA_CATALOG = process.env.ATHENA_CATALOG!;
const ATHENA_DATABASE = process.env.ATHENA_DATABASE!;
const TABLE_NAME = process.env.TABLE_NAME!;

const TABLE_PATH = `"s3tablescatalog/${ATHENA_CATALOG}".${ATHENA_DATABASE}.${TABLE_NAME}`;

const sts = new STSClient({});
let cachedAthenaClient: AthenaClient | null = null;
let credentialsExpireAt = 0;

async function getAthenaClient(): Promise<AthenaClient> {
  const now = Date.now();
  if (cachedAthenaClient && now < credentialsExpireAt - 60_000) return cachedAthenaClient;

  const { Credentials } = await sts.send(
    new AssumeRoleCommand({ RoleArn: SHARED_ROLE_ARN, RoleSessionName: "iot-processor" }),
  );
  if (!Credentials?.AccessKeyId || !Credentials.SecretAccessKey || !Credentials.SessionToken) {
    throw new Error("AssumeRole returned incomplete credentials");
  }

  cachedAthenaClient = new AthenaClient({
    credentials: {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    },
  });
  credentialsExpireAt = Credentials.Expiration?.getTime() ?? now + 3_600_000;
  return cachedAthenaClient;
}

async function runAthenaInsert(client: AthenaClient, sql: string): Promise<void> {
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
    if (state === "SUCCEEDED") return;
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(
        `Athena query ${state}: ${QueryExecution?.Status?.StateChangeReason ?? "unknown"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// ── shared record schema ──────────────────────────────────────────────────────

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

const INTEGER_COLUMNS = new Set<string>([
  "timestamp", "team_id", "session_id", "course", "satellites", "gps_timestamp",
  "status_mag", "status_gyro", "status_acc", "status_sys",
]);

function parseMessage(raw: unknown): Record<string, number> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const msg = raw as Record<string, unknown>;

  const item: Record<string, number> = {};
  for (const col of COLUMNS) {
    const val = msg[col];
    if (val === null || val === undefined) continue;
    const n = typeof val === "number" ? val : Number(val);
    if (!Number.isFinite(n)) continue;
    item[col] = INTEGER_COLUMNS.has(col) ? Math.round(n) : n;
  }

  if (!item.team_id || !item.timestamp) return null;
  return item;
}

// Build a SQL "(v, v, ...)" tuple in COLUMNS order for Athena INSERT
function toValuesTuple(item: Record<string, number>): string {
  const values = COLUMNS.map((col) => {
    const n = item[col];
    return n !== undefined ? String(n) : "NULL";
  });
  return `(${values.join(", ")})`;
}

// ── handler ───────────────────────────────────────────────────────────────────

export const handler = async (event: SQSEvent) => {
  console.log("Processing", event.Records.length, "SQS messages");

  const items: Record<string, number>[] = [];
  for (const record of event.Records) {
    try {
      const item = parseMessage(JSON.parse(record.body));
      if (!item) {
        console.warn("Skipping invalid message:", record.body.slice(0, 120));
        continue;
      }
      items.push(item);
    } catch (err) {
      console.error("Failed to parse SQS message:", err);
    }
  }

  if (items.length === 0) {
    return { statusCode: 200, message: "No valid records to insert" };
  }

  const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;

  // Write to DynamoDB and Athena concurrently — a failure in either is logged
  // but does not block the other, so both stores stay as in-sync as possible.
  const [dynamoResult, athenaResult] = await Promise.allSettled([
    // DynamoDB: BatchWriteItem (max 25 per call)
    (async () => {
      const putRequests = items.map((item) => ({
        PutRequest: { Item: { ...item, ttl } },
      }));
      for (let i = 0; i < putRequests.length; i += 25) {
        await dynamo.send(new BatchWriteCommand({
          RequestItems: { [DYNAMO_TABLE]: putRequests.slice(i, i + 25) },
        }));
      }
      console.log(`DynamoDB: inserted ${items.length} records`);
    })(),

    // Athena: one multi-row INSERT per batch
    (async () => {
      const tuples = items.map(toValuesTuple);
      const sql = `INSERT INTO ${TABLE_PATH} (${COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}`;
      await runAthenaInsert(await getAthenaClient(), sql);
      console.log(`Athena: inserted ${items.length} rows into ${TABLE_NAME}`);
    })(),
  ]);

  if (dynamoResult.status === "rejected") {
    console.error("DynamoDB write failed:", dynamoResult.reason);
  }
  if (athenaResult.status === "rejected") {
    console.error("Athena write failed:", athenaResult.reason);
  }

  return { statusCode: 200, message: `Processed ${items.length} records` };
};
