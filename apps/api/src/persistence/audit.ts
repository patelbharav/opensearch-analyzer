import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { loadConfig } from "../config.js";

const config = loadConfig();

const s3 = new S3Client({
  region: config.awsRegion,
  endpoint: config.awsEndpointUrl,
  forcePathStyle: !!config.awsEndpointUrl, // LocalStack
});

export interface AuditEntry {
  attemptId: string;
  timestamp: string;
  /** Identity of the actor (will be plumbed from Cognito JWT post-M1). */
  actor: string;
  domainId: string;
  findingId: string;
  diagnosticId: string;
  fixDescription: string;
  request: unknown;
  ok: boolean;
  statusCode?: number;
  response?: unknown;
  error?: string;
}

let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.auditBucket }));
    bucketEnsured = true;
    return;
  } catch {
    // missing — create it
  }
  try {
    await s3.send(
      new CreateBucketCommand({
        Bucket: config.auditBucket,
        // us-east-1 must NOT receive a LocationConstraint; for other regions it's required.
        ...(config.awsRegion !== "us-east-1" && !config.awsEndpointUrl
          ? {
              CreateBucketConfiguration: {
                LocationConstraint: config.awsRegion as never,
              },
            }
          : {}),
      }),
    );
    bucketEnsured = true;
  } catch (err) {
    // 409 BucketAlreadyOwnedByYou is fine
    const code = (err as { name?: string }).name;
    if (code === "BucketAlreadyOwnedByYou" || code === "BucketAlreadyExists") {
      bucketEnsured = true;
      return;
    }
    throw err;
  }
}

export async function writeAuditEntry(entry: AuditEntry): Promise<string> {
  await ensureBucket();
  // Partition by date for easy retention/query.
  const day = entry.timestamp.slice(0, 10);
  const key = `${day}/${entry.findingId}/${entry.attemptId}.json`;
  await s3.send(
    new PutObjectCommand({
      Bucket: config.auditBucket,
      Key: key,
      Body: JSON.stringify(entry, null, 2),
      ContentType: "application/json",
    }),
  );
  return key;
}
