import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const HIGH_MS = 1000;     // sustained avg above 1s = problematic
const CRITICAL_MS = 5000; // 5s = users will time out

export const indexingLatency: DiagnosticDef = {
  id: "indexing-latency",
  title: "High indexing latency",
  run: (snapshot, ctx) => {
    const m = snapshot.metrics;
    if (!m || m.indexingLatency.length === 0) return [];

    const values = m.indexingLatency.map((p) => p.value);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg < HIGH_MS) return [];

    return [
      makeFinding({
        diagnosticId: "indexing-latency",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "latency",
        severity: avg >= CRITICAL_MS ? "critical" : "high",
        title: `Indexing latency averaged ${Math.round(avg)} ms over ${m.window}`,
        summary:
          "High indexing latency points at undersized write thread pools, oversized bulk requests, or " +
          "frequent refreshes. AWS recommends sustained avg under 1s for log-analytics workloads.",
        evidence: {
          metricName: "IndexingLatency",
          value: avg,
          threshold: HIGH_MS,
          raw: { avgMs: avg, maxMs: max, samples: values.length, window: m.window },
        },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Tune write path.",
          steps: [
            "Increase index.refresh_interval (default 1s) to 30s on log-analytics indices.",
            "Use larger bulk batches (5–15 MiB per request) but watch heap pressure.",
            "Disable replicas during bulk loads, then re-enable.",
            "Scale up data nodes if write thread pool is saturating.",
          ],
        },
      }),
    ];
  },
};
