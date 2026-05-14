export type Severity = "critical" | "high" | "medium" | "low";

export type FindingCategory =
  | "shard"
  | "jvm"
  | "cpu"
  | "disk"
  | "errors"
  | "latency"
  | "config"
  | "cluster";

export type DomainAuthMode = "sigv4" | "masterUser" | "cognito";

export interface Domain {
  id: string;
  arn: string;
  name: string;
  region: string;
  endpoint: string;
  authMode: DomainAuthMode;
  createdAt: string;
  lastScanAt?: string;

  /** SigV4 mode: optional cross-account role ARN to assume before signing. */
  assumedRoleArn?: string;

  /** Master-user mode: username (password lives in Secrets Manager). */
  masterUsername?: string;
  /** Master-user mode: ARN of the secret holding the password. */
  masterPasswordSecretArn?: string;
}

export interface CreateDomainRequest {
  name: string;
  arn: string;
  region: string;
  endpoint: string;
  authMode: DomainAuthMode;
  assumedRoleArn?: string;
  masterUsername?: string;
  /** Plaintext on the wire (TLS); never persisted. Stored in Secrets Manager. */
  masterPassword?: string;
}

export interface FixApiCall {
  kind: "apiCall";
  description: string;
  confirmationRequired: boolean;
  payload: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    body?: unknown;
  };
  rollback?: FixApiCall["payload"];
}

export interface FixAwsCall {
  kind: "awsCall";
  description: string;
  confirmationRequired: boolean;
  payload: {
    service: string;
    operation: string;
    input: Record<string, unknown>;
  };
  rollback?: FixAwsCall["payload"];
}

export interface FixGuidance {
  kind: "guidance";
  description: string;
  confirmationRequired: false;
  steps: string[];
}

export type Fix = FixApiCall | FixAwsCall | FixGuidance;

export interface Evidence {
  metricName?: string;
  value?: number;
  threshold?: number;
  query?: string;
  raw?: unknown;
}

export interface FixResult {
  ok: boolean;
  appliedAt: string;
  /** Status code from the OpenSearch / AWS API call. */
  statusCode?: number;
  /** Echoed response body (truncated for safety). */
  response?: unknown;
  /** Error message if !ok. */
  error?: string;
  /** S3 audit log object key for this attempt. */
  auditKey?: string;
}

export interface Finding {
  id: string;
  domainId: string;
  diagnosticId: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  summary: string;
  evidence: Evidence;
  fix?: Fix;
  createdAt: string;
  dismissedAt?: string;
  /** Set after a successful fix execution. */
  appliedAt?: string;
  /** Most recent fix attempt outcome. */
  lastFixResult?: FixResult;
}

export interface ScanResult {
  scanId: string;
  domainId: string;
  startedAt: string;
  completedAt?: string;
  findings: Finding[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ name: string; arguments: unknown; result?: unknown }>;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  domainId?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ---- LLM Provider Settings ----

export type LlmProvider = "bedrock" | "anthropic" | "openai" | "vertex";

export interface BedrockConfig {
  provider: "bedrock";
  region: string;
  modelId: string;
  /** If set, use this profile. Otherwise default credential chain. */
  awsProfile?: string;
}

export interface AnthropicConfig {
  provider: "anthropic";
  modelId: string;
  /** API key stored in Secrets Manager — never returned to the frontend. */
  apiKeySet: boolean;
}

export interface OpenAIConfig {
  provider: "openai";
  modelId: string;
  /** API key stored in Secrets Manager. */
  apiKeySet: boolean;
  /** Optional base URL for Azure OpenAI or compatible endpoints. */
  baseUrl?: string;
}

export interface VertexConfig {
  provider: "vertex";
  project: string;
  location: string;
  modelId: string;
}

export type LlmConfig = BedrockConfig | AnthropicConfig | OpenAIConfig | VertexConfig;

export interface AppSettings {
  llm: LlmConfig;
  updatedAt?: string;
}

/** What the PUT /api/settings body looks like (keys are optional strings). */
export interface UpdateSettingsRequest {
  llm: LlmConfig & {
    /** Plaintext API key — only sent on PUT, never on GET. Stored in Secrets Manager. */
    apiKey?: string;
  };
}
