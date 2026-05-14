import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import bcrypt from "bcryptjs";
import type { UserProfile, ActionRecord } from "@osa/shared-types";
import { loadConfig } from "../config.js";

const config = loadConfig();

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.awsRegion, endpoint: config.awsEndpointUrl }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const TABLE = config.dynamoTableName;
const SALT_ROUNDS = 10;

// ---- User CRUD ----

export async function createUser(
  user: UserProfile,
  password: string,
): Promise<void> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: "USER", sk: `U#${user.username}`, ...user, passwordHash: hash },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

export async function getUserByUsername(
  username: string,
): Promise<(UserProfile & { passwordHash: string }) | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: "USER", sk: `U#${username}` },
    }),
  );
  if (!res.Item) return undefined;
  const { pk: _pk, sk: _sk, ...rest } = res.Item;
  return rest as unknown as UserProfile & { passwordHash: string };
}

export async function verifyPassword(
  username: string,
  password: string,
): Promise<UserProfile | null> {
  const user = await getUserByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const { passwordHash: _h, ...profile } = user;
  return profile;
}

export async function updateLastLogin(username: string): Promise<void> {
  const user = await getUserByUsername(username);
  if (!user) return;
  const { passwordHash, ...profile } = user;
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: "USER",
        sk: `U#${username}`,
        ...profile,
        lastLoginAt: new Date().toISOString(),
        passwordHash,
      },
    }),
  );
}

export async function listUsers(): Promise<UserProfile[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "USER" },
    }),
  );
  return (res.Items ?? []).map((it) => {
    const { pk: _pk, sk: _sk, passwordHash: _h, ...rest } = it as Record<string, unknown>;
    return rest as unknown as UserProfile;
  });
}

// ---- Action History ----

export async function recordAction(action: ActionRecord): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `ACTIONS#${action.userId}`,
        sk: `A#${action.timestamp}#${action.id}`,
        ...action,
      },
    }),
  );
}

export async function listActions(
  userId: string,
  limit = 50,
): Promise<ActionRecord[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `ACTIONS#${userId}` },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []).map((it) => {
    const { pk: _pk, sk: _sk, ...rest } = it as Record<string, unknown>;
    return rest as unknown as ActionRecord;
  });
}

export async function listAllActions(limit = 100): Promise<ActionRecord[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "begins_with(pk, :prefix)",
      ExpressionAttributeValues: { ":prefix": "ACTIONS#" },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []).map((it) => {
    const { pk: _pk, sk: _sk, ...rest } = it as Record<string, unknown>;
    return rest as unknown as ActionRecord;
  });
}
