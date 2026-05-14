import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const HARD_LIMIT = 30_000;

export const shardCount: DiagnosticDef = {
  id: "shard-count",
  title: "Too many active shards",
  run: (snapshot, ctx) => {
    const total = snapshot.clusterHealth.active_shards;
    if (total < HARD_LIMIT) return [];
    return [
      makeFinding({
        diagnosticId: "shard-count",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "shard",
        severity: "high",
        title: `Cluster has ${total} active shards (limit ${HARD_LIMIT})`,
        summary:
          "AWS recommends fewer than 30k shards per cluster. Excess shards consume CPU/memory and slow cluster state ops. " +
          "Common cause: over-rotated indices (e.g. hourly when daily would do).",
        evidence: { metricName: "active_shards", value: total, threshold: HARD_LIMIT },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Reduce shard count via ISM rollover or _shrink.",
          steps: [
            "Configure an ISM rollover policy that rolls indices when they reach a target size, not a fixed schedule.",
            "Apply POST /<index>/_shrink/<target> to shrink indices that have many small shards.",
            "Delete indices older than your retention window via ISM delete action.",
          ],
        },
      }),
    ];
  },
};
