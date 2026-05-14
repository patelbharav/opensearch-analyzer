export interface AppConfig {
  port: number;
  host: string;
  logLevel: string;
  corsOrigin: string;
  awsRegion: string;
  /** Override AWS endpoint (LocalStack, etc.). */
  awsEndpointUrl?: string;
  /** DynamoDB table name for Domain records and findings. */
  dynamoTableName: string;
  /** S3 bucket for the fix audit log. */
  auditBucket: string;
  /** Origins allowed to embed the UI in an iframe (CSP frame-ancestors). */
  embedAllowedOrigins: string[];
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "0.0.0.0",
    logLevel: process.env.LOG_LEVEL ?? "info",
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    awsEndpointUrl: process.env.AWS_LOCAL_ENDPOINT_URL,
    dynamoTableName: process.env.DYNAMO_TABLE_NAME ?? "opensearch-analyzer",
    auditBucket: process.env.AUDIT_BUCKET ?? "opensearch-analyzer-audit",
    embedAllowedOrigins: parseOrigins(process.env.EMBED_ALLOWED_ORIGINS),
  };
}

/**
 * Parse a comma-separated origin list. Defaults include the AWS console plus
 * localhost (so the dev demo host page works).
 */
function parseOrigins(input: string | undefined): string[] {
  if (input && input.trim().length > 0) {
    return input.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [
    "https://*.console.aws.amazon.com",
    "https://console.aws.amazon.com",
    "http://localhost:5173",
    "http://localhost:3001",
  ];
}
