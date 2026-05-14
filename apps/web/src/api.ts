import type {
  AppSettings,
  CreateDomainRequest,
  Domain,
  Finding,
  FixResult,
  ScanResult,
  UpdateSettingsRequest,
} from "@osa/shared-types";
import type { ClusterMetrics } from "@osa/diagnostics-core";

const BASE = "/api";

export interface ConnectionTestResult {
  ok: boolean;
  clusterName?: string;
  version?: string;
  status?: string;
  error?: string;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (init?.body !== undefined && headers["content-type"] === undefined) {
    headers["content-type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listDomains: () => http<{ domains: Domain[] }>("/domains"),
  createDomain: (body: CreateDomainRequest) =>
    http<Domain>("/domains", { method: "POST", body: JSON.stringify(body) }),
  deleteDomain: (id: string) =>
    http<void>(`/domains/${encodeURIComponent(id)}`, { method: "DELETE" }),
  testNewConnection: (body: CreateDomainRequest) =>
    http<ConnectionTestResult>("/domains/test-connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testConnection: (id: string) =>
    http<ConnectionTestResult>(
      `/domains/${encodeURIComponent(id)}/test-connection`,
      { method: "POST" },
    ),
  scan: (domainId: string) =>
    http<ScanResult>(`/scan/${encodeURIComponent(domainId)}`, { method: "POST" }),
  listFindings: (domainId: string) =>
    http<{ findings: Finding[] }>(
      `/findings?domainId=${encodeURIComponent(domainId)}`,
    ),
  applyFix: (findingId: string) =>
    http<FixResult>(`/fix/${encodeURIComponent(findingId)}`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }),
  metrics: (domainId: string, window: "1h" | "6h" | "24h" | "7d" = "24h") =>
    http<{ domainId: string; window: string; metrics: ClusterMetrics }>(
      `/metrics/${encodeURIComponent(domainId)}?window=${window}`,
    ),
  getSettings: () => http<AppSettings>("/settings"),
  updateSettings: (body: UpdateSettingsRequest) =>
    http<AppSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
