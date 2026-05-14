import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const HIGH_MS = 500;       // half a second avg = bad UX for interactive search
const CRITICAL_MS = 2000;

export const searchLatency: DiagnosticDef = {
  id: "search-latency",
  title: "Slow search responses",
  run: (snapshot, ctx) => {
    const m = snapshot.metrics;
    if (!m || m.searchLatency.length === 0) return [];

    const values = m.searchLatency.map((p) => p.value);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg < HIGH_MS) return [];

    return [
      makeFinding({
        diagnosticId: "search-latency",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "latency",
        severity: avg >= CRITICAL_MS ? "critical" : "high",
        title: `Search latency averaged ${Math.round(avg)} ms over ${m.window}`,
        summary:
          "Slow searches usually trace to: leading-wildcard queries, deep aggregations, oversized shards " +
          "(each adds startup overhead), or insufficient field-data cache. Enable slow logs to identify " +
          "the offending queries.",
        evidence: {
          metricName: "SearchLatency",
          value: avg,
          threshold: HIGH_MS,
          raw: { avgMs: avg, maxMs: max, samples: values.length, window: m.window },
        },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Find and fix the slow queries.",
          steps: [
            "Enable search slow log: PUT /<index>/_settings { index.search.slowlog.threshold.query.warn: '500ms' }",
            "Replace text-field aggregations with keyword fields.",
            "Avoid leading wildcards (use ngram/edge_ngram analyzers).",
            "Right-size shards (10–30 GiB for search workloads).",
          ],
        },
      }),
    ];
  },
};
