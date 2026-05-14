import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const REJECTION_THRESHOLD = 100;

export const threadPoolRejections: DiagnosticDef = {
  id: "thread-pool-rejections",
  title: "Thread pool rejections (search or write)",
  run: (snapshot, ctx) => {
    const stats = snapshot.threadPoolStats;
    if (!stats || stats.length === 0) return [];

    const findings = [];
    const searchOffenders = stats.filter((n) => n.search.rejected > REJECTION_THRESHOLD);
    const writeOffenders = stats.filter((n) => n.write.rejected > REJECTION_THRESHOLD);

    if (searchOffenders.length > 0) {
      const maxRejected = Math.max(...searchOffenders.map((n) => n.search.rejected));
      findings.push(
        makeFinding({
          diagnosticId: "thread-pool-rejections",
          domainId: ctx.domainId,
          now: ctx.now,
          category: "errors",
          severity: maxRejected > 1000 ? "critical" : "high",
          title: `Search thread pool: ${searchOffenders.length} node(s) with rejections`,
          summary:
            "Search requests are being rejected because the search thread pool queue is full. " +
            "Clients see 429 errors. Causes: too many concurrent searches, expensive queries, or undersized cluster.",
          evidence: { raw: searchOffenders },
          fix: {
            kind: "guidance",
            confirmationRequired: false,
            description: "Reduce search concurrency or scale.",
            steps: [
              "Identify expensive queries via slow logs.",
              "Add data nodes to spread the search load.",
              "Increase search queue size cautiously (risks OOM): PUT /_cluster/settings { persistent: { thread_pool.search.queue_size: 1000 }}.",
            ],
          },
        }),
      );
    }

    if (writeOffenders.length > 0) {
      const maxRejected = Math.max(...writeOffenders.map((n) => n.write.rejected));
      findings.push(
        makeFinding({
          diagnosticId: "thread-pool-rejections",
          domainId: ctx.domainId,
          now: ctx.now,
          category: "errors",
          severity: maxRejected > 1000 ? "critical" : "high",
          title: `Write thread pool: ${writeOffenders.length} node(s) with rejections`,
          summary:
            "Indexing requests are being rejected. Clients see 429 or EsRejectedExecutionException. " +
            "Causes: bulk request rate exceeds cluster capacity, or refresh_interval too aggressive.",
          evidence: { raw: writeOffenders },
          fix: {
            kind: "guidance",
            confirmationRequired: false,
            description: "Reduce write throughput or scale.",
            steps: [
              "Increase index.refresh_interval to 30s on log-analytics indices.",
              "Reduce bulk request concurrency from the client side.",
              "Add data nodes or use larger instance types.",
            ],
          },
        }),
      );
    }

    return findings;
  },
};
