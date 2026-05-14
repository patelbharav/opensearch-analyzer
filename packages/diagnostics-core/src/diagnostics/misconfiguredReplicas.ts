import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

export const misconfiguredReplicas: DiagnosticDef = {
  id: "misconfigured-replicas",
  title: "Misconfigured replica count",
  run: (snapshot, ctx) => {
    const dataNodes = snapshot.clusterHealth.number_of_data_nodes;

    type Issue = { index: string; replicas: number; reason: "zero" | "exceedsNodes"; primaries: number };
    const issues: Issue[] = [];

    for (const idx of snapshot.catIndices) {
      if (idx.index.startsWith(".")) continue; // skip system indices
      const rep = parseInt(idx.rep, 10);
      const pri = parseInt(idx.pri, 10);
      if (!Number.isFinite(rep) || !Number.isFinite(pri)) continue;

      if (rep === 0 && dataNodes > 1) {
        issues.push({ index: idx.index, replicas: rep, reason: "zero", primaries: pri });
      } else if (rep > dataNodes - 1) {
        issues.push({ index: idx.index, replicas: rep, reason: "exceedsNodes", primaries: pri });
      }
    }

    if (issues.length === 0) return [];

    const exceeds = issues.filter((i) => i.reason === "exceedsNodes");
    const zeros = issues.filter((i) => i.reason === "zero");

    const findings = [];
    if (exceeds.length > 0) {
      const fix: import("@osa/shared-types").FixApiCall = {
        kind: "apiCall",
        description: `Reduce replicas to ${dataNodes - 1} on ${exceeds.length} index(es).`,
        confirmationRequired: true,
        payload: {
          method: "PUT",
          path: `/${exceeds.map((i) => i.index).join(",")}/_settings`,
          body: { index: { number_of_replicas: dataNodes - 1 } },
        },
      };
      findings.push(
        makeFinding({
          diagnosticId: "misconfigured-replicas",
          domainId: ctx.domainId,
          now: ctx.now,
          category: "config",
          severity: "high",
          title: `${exceeds.length} index(es) request more replicas than data nodes`,
          summary:
            "Replica count must be ≤ data_nodes - 1 to fully assign. Cluster will stay yellow until reduced.",
          evidence: { raw: exceeds },
          fix,
        }),
      );
    }
    if (zeros.length > 0) {
      findings.push(
        makeFinding({
          diagnosticId: "misconfigured-replicas",
          domainId: ctx.domainId,
          now: ctx.now,
          category: "config",
          severity: "medium",
          title: `${zeros.length} index(es) have zero replicas`,
          summary:
            "Indices with replicas=0 lose data if their node fails. Acceptable for ephemeral/test data; otherwise increase.",
          evidence: { raw: zeros },
          fix: {
            kind: "apiCall",
            description: `Set replicas=1 on ${zeros.length} index(es).`,
            confirmationRequired: true,
            payload: {
              method: "PUT",
              path: `/${zeros.map((i) => i.index).join(",")}/_settings`,
              body: { index: { number_of_replicas: 1 } },
            },
          },
        }),
      );
    }
    return findings;
  },
};
