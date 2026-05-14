import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import {
  fromNodeProviderChain,
  fromTemporaryCredentials,
} from "@aws-sdk/credential-providers";
import type { Domain } from "@osa/shared-types";
import { getMasterUserCredentials } from "./secrets.js";

export interface OpenSearchTarget {
  client: Client;
  domain: Domain;
}

export interface BuildTargetOptions {
  domain: Domain;
  /** Optional override for the master-user password (skip Secrets Manager). */
  masterUserPassword?: string;
}

export async function buildTarget(opts: BuildTargetOptions): Promise<OpenSearchTarget> {
  const { domain } = opts;
  switch (domain.authMode) {
    case "sigv4":
      return { client: buildSigV4Client(domain), domain };
    case "masterUser": {
      const password =
        opts.masterUserPassword ?? (await getMasterUserCredentials(domain)).password;
      return { client: buildBasicAuthClient(domain, domain.masterUsername!, password), domain };
    }
    case "cognito":
      throw new Error(
        "Cognito-protected OpenSearch domains are not yet supported. Tracked as a deferred M1 task.",
      );
    default: {
      const _exhaustive: never = domain.authMode;
      throw new Error(`Unknown auth mode: ${String(_exhaustive)}`);
    }
  }
}

function buildSigV4Client(domain: Domain): Client {
  const credentials = domain.assumedRoleArn
    ? fromTemporaryCredentials({
        params: {
          RoleArn: domain.assumedRoleArn,
          RoleSessionName: `osa-${domain.id}`,
          DurationSeconds: 3600,
        },
      })
    : fromNodeProviderChain();

  return new Client({
    ...AwsSigv4Signer({
      region: domain.region,
      service: "es",
      getCredentials: () => credentials(),
    }),
    node: normalizeEndpoint(domain.endpoint),
  });
}

function buildBasicAuthClient(domain: Domain, username: string, password: string): Client {
  return new Client({
    node: normalizeEndpoint(domain.endpoint),
    auth: { username, password },
    ssl: { rejectUnauthorized: !isLocalEndpoint(domain.endpoint) },
  });
}

function normalizeEndpoint(endpoint: string): string {
  if (/^https?:\/\//.test(endpoint)) return endpoint;
  return `https://${endpoint}`;
}

function isLocalEndpoint(endpoint: string): boolean {
  return /localhost|127\.0\.0\.1|opensearch:9200/.test(endpoint);
}

export async function pingTarget(target: OpenSearchTarget): Promise<{
  ok: boolean;
  clusterName?: string;
  version?: string;
  status?: string;
  error?: string;
  statusCode?: number;
  body?: unknown;
}> {
  try {
    const info = await target.client.info();
    const health = await target.client.cluster.health({});
    return {
      ok: true,
      clusterName: info.body.cluster_name,
      version: info.body.version?.number,
      status: health.body.status,
    };
  } catch (err) {
    const meta = (err as { meta?: { statusCode?: number; body?: unknown } }).meta;
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      statusCode: meta?.statusCode,
      body: meta?.body,
    };
  }
}
