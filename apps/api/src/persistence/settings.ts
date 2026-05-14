import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-secrets-manager";
import type { AppSettings, LlmConfig } from "@osa/shared-types";
import { loadConfig } from "../config.js";

const config = loadConfig();

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.awsRegion, endpoint: config.awsEndpointUrl }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const secrets = new SecretsManagerClient({
  region: config.awsRegion,
  endpoint: config.awsEndpointUrl,
});

const TABLE = config.dynamoTableName;
const SETTINGS_PK = "SETTINGS";
const SETTINGS_SK = "APP";
const SECRET_NAME = "opensearch-analyzer/llm-api-key";

// ---- Settings CRUD ----

const DEFAULT_SETTINGS: AppSettings = {
  llm: {
    provider: "bedrock",
    region: config.awsRegion,
    modelId: process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-6",
  },
};

export async function getSettings(): Promise<AppSettings> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: SETTINGS_PK, sk: SETTINGS_SK },
    }),
  );
  if (!res.Item) return DEFAULT_SETTINGS;
  const { pk: _pk, sk: _sk, ...rest } = res.Item;
  return rest as unknown as AppSettings;
}

export async function putSettings(settings: AppSettings): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: SETTINGS_PK, sk: SETTINGS_SK, ...settings },
    }),
  );
}

// ---- API key storage ----

export async function storeLlmApiKey(key: string): Promise<void> {
  try {
    await secrets.send(
      new PutSecretValueCommand({
        SecretId: SECRET_NAME,
        SecretString: key,
      }),
    );
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      await secrets.send(
        new CreateSecretCommand({
          Name: SECRET_NAME,
          SecretString: key,
          Description: "OpenSearch Analyzer LLM provider API key",
        }),
      );
      return;
    }
    throw err;
  }
}

export async function getLlmApiKey(): Promise<string | undefined> {
  try {
    const res = await secrets.send(
      new GetSecretValueCommand({ SecretId: SECRET_NAME }),
    );
    return res.SecretString ?? undefined;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return undefined;
    throw err;
  }
}

/** Returns the settings safe to show on the frontend (no raw API key). */
export function sanitizeForFrontend(settings: AppSettings): AppSettings {
  const llm = { ...settings.llm };
  // Mark whether a key is set, but don't expose it.
  if (llm.provider === "anthropic" || llm.provider === "openai") {
    (llm as { apiKeySet?: boolean }).apiKeySet = true; // presence checked separately
  }
  return { ...settings, llm: llm as LlmConfig };
}
