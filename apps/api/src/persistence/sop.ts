import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import YAML from "yaml";
import type { SopRuleSet } from "@osa/shared-types";
import { loadConfig } from "../config.js";

const config = loadConfig();

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.awsRegion, endpoint: config.awsEndpointUrl }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const TABLE = config.dynamoTableName;

export async function listSopRuleSets(): Promise<SopRuleSet[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "SOP" },
    }),
  );
  return (res.Items ?? []).map(stripKeys);
}

export async function getSopRuleSet(id: string): Promise<SopRuleSet | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { pk: "SOP", sk: `RS#${id}` } }),
  );
  return res.Item ? stripKeys(res.Item) : undefined;
}

export async function putSopRuleSet(rs: SopRuleSet): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: "SOP", sk: `RS#${rs.id}`, ...rs },
    }),
  );
}

export async function deleteSopRuleSet(id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: TABLE, Key: { pk: "SOP", sk: `RS#${id}` } }),
  );
}

export async function getActiveSopRuleSets(domainId: string): Promise<SopRuleSet[]> {
  const all = await listSopRuleSets();
  return all.filter(
    (rs) =>
      rs.enabled &&
      (rs.domainIds.length === 0 || rs.domainIds.includes(domainId)),
  );
}

// ---- YAML import/export ----

export function exportToYaml(rs: SopRuleSet): string {
  const { id: _id, createdAt: _c, updatedAt: _u, ...exportable } = rs;
  return YAML.stringify(exportable, { lineWidth: 120 });
}

export function importFromYaml(yamlStr: string, id: string): SopRuleSet {
  const parsed = YAML.parse(yamlStr) as Partial<SopRuleSet>;
  if (!parsed.name) throw new Error("YAML must include a 'name' field.");
  if (!Array.isArray(parsed.rules)) throw new Error("YAML must include a 'rules' array.");

  const now = new Date().toISOString();
  return {
    id,
    name: parsed.name,
    description: parsed.description,
    domainIds: parsed.domainIds ?? [],
    rules: parsed.rules,
    enabled: parsed.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

function stripKeys(item: Record<string, unknown>): SopRuleSet {
  const { pk: _pk, sk: _sk, ...rest } = item;
  return rest as unknown as SopRuleSet;
}
