import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

export const ismHealth: DiagnosticDef = {
  id: "ism-health",
  title: "ISM policy missing or failed",
  run: (snapshot, ctx) => {
    const statuses = snapshot.ismStatuses;
    if (!statuses || statuses.length === 0) return [];

    const noPolicy = statuses.filter((s) => !s.index.startsWith(".") && !s.policyId);
    const failed = statuses.filter((s) => s.failed);

    const findings = [];

    if (failed.length > 0) {
      findings.push(
        makeFinding({
          diagnosticId: "ism-health",
          domainId: ctx.domainId,
          now: ctx.now,
          category: "config",
          severity: "high",
          title: `${failed.length} index(es) have a failed ISM policy`,
          summary:
            "These indices have an ISM policy attached but it's in a failed state — automatic rollover, " +
            "deletion, or tier migration has stopped. The index will grow unbounded until the policy is fixed.",
          evidence: { raw: failed.slice(0, 20) },
          fix: {
            kind: "guidance",
            confirmationRequired: false,
            description: "Investigate and retry the failed ISM policies.",
            steps: [
              "GET /_plugins/_ism/explain/<index> to see the failure reason.",
              "Fix the underlying issue (e.g. missing snapshot repo, disk full).",
              "POST /_plugins/_ism/retry/<index> to retry the failed step.",
            ],
          },
        }),
      );
    }

    if (noPolicy.length >= 5) {
      findings.push(
        makeFinding({
          diagnosticId: "ism-health",
          domainId: ctx.domainId,
          now: ctx.now,
          category: "config",
          severity: "medium",
          title: `${noPolicy.length} non-system index(es) have no ISM policy`,
          summary:
            "Indices without an ISM policy won't be automatically rolled over, migrated to warm/cold storage, " +
            "or deleted. Over time they accumulate and consume disk, JVM heap (cluster state), and shard slots.",
          evidence: { raw: noPolicy.slice(0, 20).map((s) => s.index) },
          fix: {
            kind: "guidance",
            confirmationRequired: false,
            description: "Attach ISM policies to manage index lifecycle.",
            steps: [
              "Create an ISM policy in OpenSearch Dashboards with rollover + delete actions.",
              "Attach it via: POST /_plugins/_ism/add/<index-pattern> { policy_id: 'your-policy' }.",
              "Use an index template to auto-attach the policy to future indices.",
            ],
          },
        }),
      );
    }

    return findings;
  },
};
