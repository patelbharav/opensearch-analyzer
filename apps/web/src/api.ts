import type {
  ActionRecord,
  AppSettings,
  CreateDomainRequest,
  Domain,
  Finding,
  FixResult,
  ScanResult,
  SopRuleSet,
  UpdateSettingsRequest,
  UserProfile,
} from "@osa/shared-types";
import type { ClusterMetrics } from "@osa/diagnostics-core";

const BASE = "/api";

const TOKEN_KEY = "osa-auth-token";

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

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
  // SOP
  listSopRuleSets: () => http<{ ruleSets: SopRuleSet[] }>("/sop"),
  getSopRuleSet: (id: string) => http<SopRuleSet>(`/sop/${encodeURIComponent(id)}`),
  createSopRuleSet: (body: Omit<SopRuleSet, "id" | "createdAt" | "updatedAt">) =>
    http<SopRuleSet>("/sop", { method: "POST", body: JSON.stringify(body) }),
  updateSopRuleSet: (id: string, body: SopRuleSet) =>
    http<SopRuleSet>(`/sop/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteSopRuleSet: (id: string) =>
    http<void>(`/sop/${encodeURIComponent(id)}`, { method: "DELETE" }),
  exportSopYaml: (id: string) =>
    fetch(`${BASE}/sop/${encodeURIComponent(id)}/export`).then((r) => r.text()),
  importSopYaml: (yaml: string) =>
    http<SopRuleSet>("/sop/import", {
      method: "POST",
      body: yaml,
      headers: { "content-type": "text/yaml" } as Record<string, string>,
    }),
  // Auth
  login: (username: string, password: string) =>
    http<{ user: UserProfile; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string, displayName?: string) =>
    http<{ user: UserProfile; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, displayName }),
    }),
  getMe: () => {
    const token = getStoredToken();
    if (!token) return Promise.resolve(null);
    return http<{ userId: string; username: string; role: string }>("/auth/me", {
      headers: { Authorization: `Bearer ${token}` } as Record<string, string>,
    }).catch(() => null);
  },
  listActions: (userId?: string) =>
    http<{ actions: ActionRecord[] }>(`/auth/actions${userId ? `?userId=${userId}` : ""}`),
};
