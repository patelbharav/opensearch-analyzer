import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const RATE_THRESHOLD = 0.10; // 10% of requests
const MIN_REQUESTS = 100;    // ignore noise on idle clusters

export const http5xxRate: DiagnosticDef = {
  id: "http-5xx-rate",
  title: "Elevated 5xx response rate",
  run: (snapshot, ctx) => {
    const m = snapshot.metrics;
    if (!m) return [];

    let total5xx = 0;
    let totalReq = 0;
    for (const p of m.http5xx) total5xx += p.value;
    for (const p of m.openSearchRequests) totalReq += p.value;

    if (totalReq < MIN_REQUESTS) return [];
    const rate = total5xx / totalReq;
    if (rate < RATE_THRESHOLD) return [];

    return [
      makeFinding({
        diagnosticId: "http-5xx-rate",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "errors",
        severity: rate >= 0.25 ? "critical" : "high",
        title: `${(rate * 100).toFixed(1)}% of requests returned 5xx over ${m.window}`,
        summary:
          "Sustained 5xx rates above 10% indicate overload — data nodes saturated, thread-pool queues full, " +
          "or requests timing out before completing. Most common causes: undersized instances, expensive " +
          "queries (deep aggregations, leading wildcards), or write spikes overwhelming the indexing thread pool.",
        evidence: {
          metricName: "5xx / OpenSearchRequests",
          value: rate,
          threshold: RATE_THRESHOLD,
          raw: { total5xx, totalReq, window: m.window },
        },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Reduce load or scale data nodes.",
          steps: [
            "GET /_nodes/hot_threads to see what's burning CPU.",
            "Scale to larger instance types or add data nodes.",
            "Inspect slow logs for expensive queries; rewrite or cache hot results.",
            "If concentrated in writes: review bulk size, refresh interval, and per-index shard count.",
          ],
        },
      }),
    ];
  },
};
