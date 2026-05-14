import { tool } from "ai";
import { z } from "zod";
import { runAllDiagnostics } from "@osa/diagnostics-core";
import type { Domain } from "@osa/shared-types";
import { buildTarget } from "../opensearch/target.js";
import { collectSnapshot } from "../opensearch/collector.js";

/**
 * All tools are READ-ONLY. The agent cannot mutate cluster state — fixes go
 * through the human-confirmed Fix engine, not the LLM.
 */
export function buildToolset(domain: Domain) {
  return {
    getClusterHealth: tool({
      description:
        "Get current cluster health: green/yellow/red status, node count, shard counts, unassigned shards.",
      inputSchema: z.object({}),
      execute: async () => {
        const target = await buildTarget({ domain });
        const res = await target.client.cluster.health({});
        return res.body;
      },
    }),

    getCatIndices: tool({
      description:
        "List all indices with primary/replica counts, doc counts, sizes, and creation date. " +
        "Use this to inspect shard sizing per index.",
      inputSchema: z.object({
        indexPattern: z
          .string()
          .optional()
          .describe("Optional index pattern (e.g. 'logs-*'). Default: all indices."),
      }),
      execute: async ({ indexPattern }) => {
        const target = await buildTarget({ domain });
        const res = await target.client.cat.indices({
          format: "json",
          bytes: "b",
          h: "health,status,index,uuid,pri,rep,docs.count,docs.deleted,store.size,pri.store.size,creation.date",
          ...(indexPattern ? { index: indexPattern } : {}),
        });
        return res.body;
      },
    }),

    getNodesStats: tool({
      description:
        "Per-node stats: JVM heap usage, CPU percent, disk free. Use to find hot nodes and JVM pressure.",
      inputSchema: z.object({}),
      execute: async () => {
        const target = await buildTarget({ domain });
        const res = await target.client.nodes.stats({ metric: ["jvm", "os", "process", "fs"] });
        // Flatten to keep responses small.
        return Object.values((res.body as { nodes: Record<string, unknown> }).nodes ?? {}).map(
          (n) => {
            const node = n as {
              name: string;
              roles: string[];
              jvm?: { mem?: { heap_used_percent?: number } };
              os?: { cpu?: { percent?: number } };
              fs?: { total?: { available_in_bytes?: number; total_in_bytes?: number } };
            };
            return {
              name: node.name,
              roles: node.roles,
              heap_used_percent: node.jvm?.mem?.heap_used_percent,
              cpu_percent: node.os?.cpu?.percent,
              disk_available_bytes: node.fs?.total?.available_in_bytes,
              disk_total_bytes: node.fs?.total?.total_in_bytes,
            };
          },
        );
      },
    }),

    getCatShards: tool({
      description:
        "List shards across the cluster with size, doc count, primary/replica role, and node assignment.",
      inputSchema: z.object({
        indexPattern: z.string().optional(),
      }),
      execute: async ({ indexPattern }) => {
        const target = await buildTarget({ domain });
        const res = await target.client.cat.shards({
          format: "json",
          ...(indexPattern ? { index: indexPattern } : {}),
        });
        return res.body;
      },
    }),

    getHotThreads: tool({
      description:
        "Get the top busy threads on every node — useful when investigating high CPU. Returns text.",
      inputSchema: z.object({}),
      execute: async () => {
        const target = await buildTarget({ domain });
        const res = await target.client.transport.request({
          method: "GET",
          path: "/_nodes/hot_threads",
        });
        const body: unknown = res.body;
        const text = typeof body === "string" ? body : JSON.stringify(body);
        return text.slice(0, 8000);
      },
    }),

    runScan: tool({
      description:
        "Run the full diagnostic catalog (11 diagnostics) against the cluster and return Findings. " +
        "Best when the user asks an open question and you want a comprehensive overview.",
      inputSchema: z.object({}),
      execute: async () => {
        const target = await buildTarget({ domain });
        const snapshot = await collectSnapshot(target, { metricsWindow: "24h" });
        const findings = runAllDiagnostics(snapshot, {
          domainId: domain.id,
          now: new Date(),
        });
        return findings.map((f) => ({
          diagnosticId: f.diagnosticId,
          severity: f.severity,
          title: f.title,
          summary: f.summary,
          fix: f.fix,
        }));
      },
    }),
  };
}
