import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const CRITICAL = 92;
const HIGH = 80;

export const jvmPressure: DiagnosticDef = {
  id: "jvm-pressure",
  title: "High JVM memory pressure",
  run: (snapshot, ctx) => {
    const offenders = Object.values(snapshot.nodesStats.nodes)
      .filter((n) => (n.jvm?.mem.heap_used_percent ?? 0) >= HIGH)
      .map((n) => ({
        node: n.name,
        roles: n.roles,
        heap_used_percent: n.jvm!.mem.heap_used_percent,
      }))
      .sort((a, b) => b.heap_used_percent - a.heap_used_percent);

    if (offenders.length === 0) return [];

    const max = offenders[0]!.heap_used_percent;
    const severity: "critical" | "high" | "medium" =
      max >= CRITICAL ? "critical" : max >= HIGH ? "high" : "medium";

    return [
      makeFinding({
        diagnosticId: "jvm-pressure",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "jvm",
        severity,
        title: `${offenders.length} node(s) exceed ${HIGH}% JVM heap pressure (max ${max}%)`,
        summary:
          `JVM heap usage above ${HIGH}% causes long GC pauses. Above ${CRITICAL}% the cluster blocks writes ` +
          "(ClusterBlockException). Common causes: aggregations on text fields, too many shards, large field-data caches.",
        evidence: { metricName: "jvm.mem.heap_used_percent", value: max, threshold: HIGH, raw: offenders },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Reduce memory pressure or scale heap.",
          steps: [
            "POST /<index>/_cache/clear?fielddata=true on the largest indices (in-progress queries will be disrupted).",
            "Find aggregations on text fields and switch the mapping to keyword.",
            "Delete or close unused indices to reduce shard count.",
            "Scale to a larger instance type (each instance gets up to 32 GiB heap).",
          ],
        },
      }),
    ];
  },
};
