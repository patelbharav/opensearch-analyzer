import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

export const circuitBreakers: DiagnosticDef = {
  id: "circuit-breakers",
  title: "Circuit breaker trips",
  run: (snapshot, ctx) => {
    const stats = snapshot.breakerStats;
    if (!stats || stats.length === 0) return [];

    type Trip = { node: string; breaker: string; tripped: number; usagePct: number };
    const trips: Trip[] = [];

    for (const node of stats) {
      for (const [name, b] of Object.entries(node.breakers)) {
        if (b.tripped > 0) {
          const usagePct = b.limit_size_in_bytes > 0
            ? (b.estimated_size_in_bytes / b.limit_size_in_bytes) * 100
            : 0;
          trips.push({ node: node.nodeName, breaker: name, tripped: b.tripped, usagePct });
        }
      }
    }

    if (trips.length === 0) return [];

    const totalTrips = trips.reduce((a, t) => a + t.tripped, 0);
    const parentTrips = trips.filter((t) => t.breaker === "parent");

    return [
      makeFinding({
        diagnosticId: "circuit-breakers",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "jvm",
        severity: parentTrips.length > 0 ? "critical" : "high",
        title: `${totalTrips} circuit breaker trip(s) across ${trips.length} breaker(s)`,
        summary:
          "Circuit breakers prevent OOM crashes by rejecting requests that would exceed JVM heap limits. " +
          "Trips mean queries or indexing operations are too memory-intensive for the current heap size. " +
          (parentTrips.length > 0
            ? "The parent breaker tripped — overall JVM heap is critically pressured."
            : "Individual breakers (fielddata, request) tripped — specific operations are too large."),
        evidence: { raw: trips.sort((a, b) => b.tripped - a.tripped).slice(0, 20) },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Reduce memory-intensive operations or scale heap.",
          steps: [
            "Check which breaker tripped: 'fielddata' → switch aggregations from text to keyword; 'request' → simplify aggregations; 'parent' → scale vertically.",
            "POST /<index>/_cache/clear?fielddata=true to free fielddata cache.",
            "Scale to a larger instance type (more heap, up to 32 GiB per node).",
            "Add data nodes to distribute memory pressure.",
          ],
        },
      }),
    ];
  },
};
