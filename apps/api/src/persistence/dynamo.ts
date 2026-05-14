import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Domain, Finding, ScanResult } from "@osa/shared-types";
import { loadConfig } from "../config.js";

const config = loadConfig();

const ddbClient = new DynamoDBClient({
  region: config.awsRegion,
  endpoint: config.awsEndpointUrl,
});
// `removeUndefinedValues: true` because Finding/FixResult have many optional
// fields (e.g. statusCode, response, error, auditKey) and the default Document
// Client rejects any item containing `undefined` with a 500.
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});

const TABLE = config.dynamoTableName;

// Single-table layout:
//   pk = "DOMAIN"          sk = `D#${domainId}`           → Domain record
//   pk = `FINDING#${dId}`  sk = `F#${createdAt}#${id}`    → Finding (M2)
//   pk = `SCAN#${dId}`     sk = `S#${scanId}`             → Scan history (M2)

interface DomainItem extends Domain {
  pk: "DOMAIN";
  sk: string;
}

export async function ensureTable(): Promise<void> {
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: TABLE }));
    return;
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
  await ddbClient.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    }),
  );
}

export async function putDomain(domain: Domain): Promise<void> {
  const item: DomainItem = { ...domain, pk: "DOMAIN", sk: `D#${domain.id}` };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function listDomains(): Promise<Domain[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "DOMAIN" },
    }),
  );
  return (res.Items ?? []).map(stripKeys);
}

export async function getDomain(id: string): Promise<Domain | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: "DOMAIN", sk: `D#${id}` },
    }),
  );
  return res.Item ? stripKeys(res.Item) : undefined;
}

export async function deleteDomain(id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: "DOMAIN", sk: `D#${id}` },
    }),
  );
}

function stripKeys(item: Record<string, unknown>): Domain {
  const { pk: _pk, sk: _sk, ...rest } = item;
  return rest as unknown as Domain;
}

// ---------- Findings + scans ----------

interface FindingItem extends Finding {
  pk: string; // FINDING#<domainId>
  sk: string; // F#<createdAt>#<id>
}

interface ScanItem extends ScanResult {
  pk: string; // SCAN#<domainId>
  sk: string; // S#<scanId>
  /** Stored separately on a finding row, not in the scan blob (DDB item size). */
  findings: never[];
}

export async function putFindings(findings: Finding[]): Promise<void> {
  // Two writes per finding: the per-domain row (queryable, ordered) and a
  // by-id row (point lookup for fix execution).
  await Promise.all(
    findings.flatMap((f) => [
      ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            ...f,
            pk: `FINDING#${f.domainId}`,
            sk: `F#${f.createdAt}#${f.id}`,
          } satisfies FindingItem,
        }),
      ),
      ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: { ...f, pk: "FINDING_BY_ID", sk: f.id },
        }),
      ),
    ]),
  );
}

export async function getFindingById(id: string): Promise<Finding | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: "FINDING_BY_ID", sk: id },
    }),
  );
  if (!res.Item) return undefined;
  const { pk: _pk, sk: _sk, ...rest } = res.Item;
  return rest as unknown as Finding;
}

export async function recordFindingApplication(
  finding: Finding,
  result: import("@osa/shared-types").FixResult,
): Promise<void> {
  const updated: Finding = {
    ...finding,
    appliedAt: result.ok ? result.appliedAt : finding.appliedAt,
    lastFixResult: result,
  };
  await Promise.all([
    ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          ...updated,
          pk: `FINDING#${finding.domainId}`,
          sk: `F#${finding.createdAt}#${finding.id}`,
        } satisfies FindingItem,
      }),
    ),
    ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...updated, pk: "FINDING_BY_ID", sk: finding.id },
      }),
    ),
  ]);
}

export async function listFindingsByDomain(
  domainId: string,
  limit = 200,
): Promise<Finding[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `FINDING#${domainId}` },
      ScanIndexForward: false, // newest first
      Limit: limit,
    }),
  );
  return (res.Items ?? []).map((it) => {
    const { pk: _pk, sk: _sk, ...rest } = it as Record<string, unknown>;
    return rest as unknown as Finding;
  });
}

export async function putScan(scan: ScanResult): Promise<void> {
  // Drop the heavy findings array from the scan record — findings live as
  // their own rows. The scan row is just a marker for "we ran one at T".
  const { findings: _f, ...header } = scan;
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        ...header,
        pk: `SCAN#${scan.domainId}`,
        sk: `S#${scan.scanId}`,
        findingCount: scan.findings.length,
      },
    }),
  );
}

export async function updateDomainLastScanAt(
  domainId: string,
  iso: string,
): Promise<void> {
  const existing = await getDomain(domainId);
  if (!existing) return;
  await putDomain({ ...existing, lastScanAt: iso });
}
