import { randomUUID } from "node:crypto";
import type { Domain, Finding, FixApiCall, FixResult } from "@osa/shared-types";
import { buildTarget } from "../opensearch/target.js";
import { writeAuditEntry } from "../persistence/audit.js";

export class FixError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "FixError";
  }
}

export interface ExecuteFixArgs {
  finding: Finding;
  domain: Domain;
  /** Caller must explicitly confirm before any mutation. */
  confirmed: boolean;
  /** Identity of the caller (TODO: plumb from Cognito JWT). */
  actor: string;
}

export async function executeFix(args: ExecuteFixArgs): Promise<FixResult> {
  const { finding, domain, confirmed, actor } = args;

  if (!finding.fix) throw new FixError("Finding has no fix attached", 400);
  const fix = finding.fix;

  if (fix.kind === "guidance") {
    throw new FixError(
      "This finding has guidance only — no automatic fix is available.",
      400,
    );
  }
  if (fix.kind === "awsCall") {
    // M3 only implements OpenSearch (apiCall) fixes. AWS-API fixes (e.g. EBS
    // resize, scaling) are deferred until the fix engine has stricter blast-
    // radius checks.
    throw new FixError("awsCall fixes are not yet supported", 501);
  }
  if (fix.confirmationRequired && !confirmed) {
    throw new FixError(
      "This fix mutates cluster state and requires explicit confirmation.",
      400,
    );
  }

  if (finding.appliedAt) {
    throw new FixError(
      "This fix has already been applied. Re-scan and apply the new finding if the issue still exists.",
      409,
    );
  }

  const apiCall = fix as FixApiCall;
  const attemptId = randomUUID();
  const timestamp = new Date().toISOString();

  const target = await buildTarget({ domain });

  let ok = false;
  let statusCode: number | undefined;
  let response: unknown;
  let error: string | undefined;

  try {
    const res = await target.client.transport.request({
      method: apiCall.payload.method,
      path: apiCall.payload.path.startsWith("/")
        ? apiCall.payload.path
        : `/${apiCall.payload.path}`,
      body: apiCall.payload.body as Record<string, unknown> | undefined,
    });
    statusCode = res.statusCode ?? undefined;
    response = truncate(res.body);
    ok = !!statusCode && statusCode >= 200 && statusCode < 300;
    if (!ok) error = `OpenSearch returned ${statusCode}`;
  } catch (err) {
    const meta = (err as { meta?: { statusCode?: number; body?: unknown } }).meta;
    statusCode = meta?.statusCode;
    response = truncate(meta?.body);
    error = err instanceof Error ? err.message : String(err);
  }

  const auditKey = await writeAuditEntry({
    attemptId,
    timestamp,
    actor,
    domainId: finding.domainId,
    findingId: finding.id,
    diagnosticId: finding.diagnosticId,
    fixDescription: fix.description,
    request: apiCall.payload,
    ok,
    statusCode,
    response,
    error,
  }).catch((err) => {
    // Audit write failure must NOT silently swallow the result, but must not
    // mask the actual fix outcome either. Log and continue.
    console.error("[fix] audit log write failed", err); // eslint-disable-line no-console
    return undefined;
  });

  const result: FixResult = {
    ok,
    appliedAt: timestamp,
    statusCode,
    response,
    error,
    auditKey,
  };
  return result;
}

function truncate(body: unknown, max = 2000): unknown {
  if (body === undefined || body === null) return body;
  const s = typeof body === "string" ? body : JSON.stringify(body);
  if (s.length <= max) return body;
  return s.slice(0, max) + "…[truncated]";
}
