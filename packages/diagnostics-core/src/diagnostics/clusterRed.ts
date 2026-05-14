import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

export const clusterRed: DiagnosticDef = {
  id: "cluster-red",
  title: "Cluster status RED",
  run: (snapshot, ctx) => {
    const h = snapshot.clusterHealth;
    if (h.status !== "red") return [];
    return [
      makeFinding({
        diagnosticId: "cluster-red",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "cluster",
        severity: "critical",
        title: "Cluster status is RED",
        summary:
          `${h.unassigned_shards} unassigned shards. At least one primary shard is not allocated. ` +
          "Automated snapshots will fail until status returns to green.",
        evidence: { raw: h },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Investigate unassigned shards before reconfiguring the domain.",
          steps: [
            "Run GET /_cluster/allocation/explain to see why a shard cannot be allocated.",
            "Run GET /_cat/indices?v and look for indices with health=red.",
            "If the red index is non-critical, delete it (DELETE /<index>) — fastest fix.",
            "If critical, restore the index from the most recent automated snapshot before it ages out (14d).",
            "Resolve red status BEFORE applying any cluster reconfiguration.",
          ],
        },
      }),
    ];
  },
};
