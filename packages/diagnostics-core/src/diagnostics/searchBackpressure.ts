import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const REJECTION_SUM_THRESHOLD = 50;

export const searchBackpressure: DiagnosticDef = {
  id: "search-backpressure",
  title: "Search backpressure rejections",
  run: (snapshot, ctx) => {
    const m = snapshot.metrics;
    if (!m) return [];

    const searchRejected = m.threadpoolSearchRejected?.reduce((a, p) => a + p.value, 0) ?? 0;
    const writeRejected = m.threadpoolWriteRejected?.reduce((a, p) => a + p.value, 0) ?? 0;
    const total = searchRejected + writeRejected;

    if (total < REJECTION_SUM_THRESHOLD) return [];

    return [
      makeFinding({
        diagnosticId: "search-backpressure",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "errors",
        severity: total > 500 ? "critical" : "high",
        title: `${total} thread pool rejection(s) via CloudWatch over ${m.window}`,
        summary:
          `Search rejections: ${Math.round(searchRejected)}, Write rejections: ${Math.round(writeRejected)}. ` +
          "The cluster is auto-cancelling requests under pressure. Clients see 429 Too Many Requests. " +
          "This is the cluster protecting itself from OOM, but it means real traffic is being dropped.",
        evidence: {
          raw: { searchRejected, writeRejected, total, window: m.window },
        },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Reduce load or scale cluster.",
          steps: [
            "Identify the heavy queries with slow logs or GET /_nodes/hot_threads.",
            "Scale data nodes horizontally (more nodes = more thread pool capacity).",
            "Reduce client-side concurrency (fewer parallel bulk/search requests).",
            "For search: simplify aggregations, use keyword fields instead of text.",
            "For writes: increase refresh_interval, reduce bulk batch rate.",
          ],
        },
      }),
    ];
  },
};
