import type { DiagnosticDef } from "../index.js";
import { makeFinding, mean, stddev } from "../util.js";

const SKEW_THRESHOLD = 0.15; // coefficient of variation > 15% = skewed

export const nodeShardSkew: DiagnosticDef = {
  id: "node-shard-skew",
  title: "Uneven shard distribution across nodes",
  run: (snapshot, ctx) => {
    if (snapshot.catAllocation.length < 2) return [];
    const counts = snapshot.catAllocation
      .map((a) => parseInt(a.shards, 10))
      .filter((n) => Number.isFinite(n));
    if (counts.length < 2) return [];

    const m = mean(counts);
    if (m === 0) return [];
    const cv = stddev(counts) / m;
    if (cv < SKEW_THRESHOLD) return [];

    const sorted = snapshot.catAllocation
      .map((a) => ({ node: a.node ?? "?", shards: parseInt(a.shards, 10), diskPct: a["disk.percent"] }))
      .sort((a, b) => b.shards - a.shards);

    return [
      makeFinding({
        diagnosticId: "node-shard-skew",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "shard",
        severity: "medium",
        title: `Shard count varies by ${Math.round(cv * 100)}% across nodes`,
        summary:
          "Uneven shard distribution leads to hot nodes — a few nodes shoulder more search/index load than the rest. " +
          "Common causes: shard count not a multiple of node count, custom routing, or AZ-awareness imbalance.",
        evidence: { metricName: "shard_count_cv", value: cv, threshold: SKEW_THRESHOLD, raw: sorted },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Rebalance by aligning shard count to node count.",
          steps: [
            "Make number_of_primary_shards × (1 + replicas) a multiple of number_of_data_nodes.",
            "If using AZ awareness, ensure equal node count per AZ.",
            "Trigger rebalance: PUT /_cluster/settings { transient: { cluster.routing.rebalance.enable: 'all' }}.",
          ],
        },
      }),
    ];
  },
};
