import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Domain, Finding } from "@osa/shared-types";

// Stub the audit writer so tests don't touch S3.
vi.mock("../persistence/audit.js", () => ({
  writeAuditEntry: vi.fn(async () => "test-audit-key"),
}));

// Stub the OpenSearch target builder.
const mockRequest = vi.fn();
vi.mock("../opensearch/target.js", () => ({
  buildTarget: vi.fn(async () => ({
    client: { transport: { request: mockRequest } },
    domain: undefined,
  })),
}));

import { executeFix, FixError } from "./engine.js";

const DOMAIN: Domain = {
  id: "d1",
  arn: "arn",
  name: "test",
  region: "us-east-1",
  endpoint: "https://example.com",
  authMode: "sigv4",
  createdAt: "2026-05-13T00:00:00Z",
};

function findingWithFix(fix: Finding["fix"]): Finding {
  return {
    id: "f1",
    domainId: "d1",
    diagnosticId: "test",
    category: "config",
    severity: "high",
    title: "test",
    summary: "test",
    evidence: {},
    fix,
    createdAt: "2026-05-13T00:00:00Z",
  };
}

beforeEach(() => {
  mockRequest.mockReset();
});

describe("executeFix", () => {
  it("rejects findings with no fix", async () => {
    await expect(
      executeFix({
        finding: findingWithFix(undefined),
        domain: DOMAIN,
        confirmed: true,
        actor: "test",
      }),
    ).rejects.toBeInstanceOf(FixError);
  });

  it("rejects guidance-only fixes", async () => {
    await expect(
      executeFix({
        finding: findingWithFix({
          kind: "guidance",
          description: "guide",
          confirmationRequired: false,
          steps: [],
        }),
        domain: DOMAIN,
        confirmed: true,
        actor: "test",
      }),
    ).rejects.toBeInstanceOf(FixError);
  });

  it("rejects awsCall fixes (not yet supported)", async () => {
    await expect(
      executeFix({
        finding: findingWithFix({
          kind: "awsCall",
          description: "scale",
          confirmationRequired: true,
          payload: { service: "es", operation: "Update", input: {} },
        }),
        domain: DOMAIN,
        confirmed: true,
        actor: "test",
      }),
    ).rejects.toThrow(/awsCall/);
  });

  it("requires explicit confirmation when fix.confirmationRequired", async () => {
    await expect(
      executeFix({
        finding: findingWithFix({
          kind: "apiCall",
          description: "set replicas",
          confirmationRequired: true,
          payload: { method: "PUT", path: "/idx/_settings", body: {} },
        }),
        domain: DOMAIN,
        confirmed: false,
        actor: "test",
      }),
    ).rejects.toThrow(/confirmation/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("executes apiCall, records 2xx as ok", async () => {
    mockRequest.mockResolvedValue({ statusCode: 200, body: { acknowledged: true } });
    const result = await executeFix({
      finding: findingWithFix({
        kind: "apiCall",
        description: "set replicas",
        confirmationRequired: true,
        payload: { method: "PUT", path: "/idx/_settings", body: { x: 1 } },
      }),
      domain: DOMAIN,
      confirmed: true,
      actor: "test",
    });
    expect(mockRequest).toHaveBeenCalledWith({
      method: "PUT",
      path: "/idx/_settings",
      body: { x: 1 },
    });
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.auditKey).toBe("test-audit-key");
  });

  it("captures failures (non-2xx) without throwing", async () => {
    mockRequest.mockRejectedValue(
      Object.assign(new Error("403"), {
        meta: { statusCode: 403, body: { error: "forbidden" } },
      }),
    );
    const result = await executeFix({
      finding: findingWithFix({
        kind: "apiCall",
        description: "x",
        confirmationRequired: true,
        payload: { method: "PUT", path: "/idx/_settings" },
      }),
      domain: DOMAIN,
      confirmed: true,
      actor: "test",
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.error).toContain("403");
    expect(result.auditKey).toBe("test-audit-key");
  });
});
