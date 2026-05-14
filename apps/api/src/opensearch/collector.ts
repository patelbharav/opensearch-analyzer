import type {
  ClusterSnapshot,
  ThreadPoolStats,
  BreakerStats,
  IndexFieldCount,
  IsmStatus,
} from "@osa/diagnostics-core";
import type { OpenSearchTarget } from "./target.js";
import { fetchMetrics, type WindowKey } from "../cloudwatch/metrics.js";

export interface CollectOpts {
  /** If set, also pull CloudWatch metrics over this window. */
  metricsWindow?: WindowKey;
}

export async function collectSnapshot(
  target: OpenSearchTarget,
  opts: CollectOpts = {},
): Promise<ClusterSnapshot> {
  const { client, domain } = target;

  const osCalls = Promise.all([
    client.cluster.health({}),
    client.nodes.stats({ metric: ["jvm", "os", "process", "fs"] }),
    client.cat.shards({ format: "json" }),
    client.cat.indices({ format: "json", bytes: "b", h: "health,status,index,uuid,pri,rep,docs.count,docs.deleted,store.size,pri.store.size,creation.date" }),
    client.cat.allocation({ format: "json", bytes: "b" }),
  ]);

  const cwCall = opts.metricsWindow
    ? fetchMetrics({ domain, window: opts.metricsWindow }).catch((err) => {
        // Don't fail the whole scan if CloudWatch isn't available.
        // eslint-disable-next-line no-console
        console.warn("[collector] CloudWatch fetch failed:", err);
        return undefined;
      })
    : Promise.resolve(undefined);

  // Extended data collection — these are optional and best-effort.
  const extendedCalls = Promise.all([
    collectThreadPoolStats(client),
    collectBreakerStats(client),
    collectIndexFieldCounts(client),
    collectIsmStatuses(client),
  ]).catch(() => [undefined, undefined, undefined, undefined] as const);

  const [[healthRes, nodesRes, shardsRes, indicesRes, allocRes], cwSeries, extended] =
    await Promise.all([osCalls, cwCall, extendedCalls]);

  const [threadPoolStats, breakerStats, indexFieldCounts, ismStatuses] = extended;

  return {
    domainId: domain.id,
    collectedAt: new Date().toISOString(),
    clusterHealth: healthRes.body as ClusterSnapshot["clusterHealth"],
    nodesStats: nodesRes.body as ClusterSnapshot["nodesStats"],
    catShards: shardsRes.body as ClusterSnapshot["catShards"],
    catIndices: indicesRes.body as ClusterSnapshot["catIndices"],
    catAllocation: allocRes.body as ClusterSnapshot["catAllocation"],
    metrics: cwSeries
      ? {
          window: opts.metricsWindow!,
          periodSec: cwSeries.jvmMemoryPressure.length > 1 ? 300 : 60,
          ...cwSeries,
        }
      : undefined,
    threadPoolStats,
    breakerStats,
    indexFieldCounts,
    ismStatuses,
  };
}

async function collectThreadPoolStats(client: OpenSearchTarget["client"]): Promise<ThreadPoolStats[] | undefined> {
  try {
    const res = await client.nodes.stats({ metric: ["thread_pool"] });
    const nodes = (res.body as { nodes: Record<string, unknown> }).nodes ?? {};
    return Object.values(nodes).map((n) => {
      const node = n as { name: string; thread_pool?: Record<string, { rejected?: number; completed?: number; queue?: number }> };
      const tp = node.thread_pool ?? {};
      return {
        nodeName: node.name,
        search: { rejected: tp.search?.rejected ?? 0, completed: tp.search?.completed ?? 0, queue: tp.search?.queue ?? 0 },
        write: { rejected: tp.write?.rejected ?? 0, completed: tp.write?.completed ?? 0, queue: tp.write?.queue ?? 0 },
      };
    });
  } catch { return undefined; }
}

async function collectBreakerStats(client: OpenSearchTarget["client"]): Promise<BreakerStats[] | undefined> {
  try {
    const res = await client.nodes.stats({ metric: ["breaker"] });
    const nodes = (res.body as { nodes: Record<string, unknown> }).nodes ?? {};
    return Object.values(nodes).map((n) => {
      const node = n as { name: string; breakers?: Record<string, { limit_size_in_bytes?: number; estimated_size_in_bytes?: number; tripped?: number }> };
      const breakers: BreakerStats["breakers"] = {};
      for (const [name, b] of Object.entries(node.breakers ?? {})) {
        breakers[name] = {
          limit_size_in_bytes: b.limit_size_in_bytes ?? 0,
          estimated_size_in_bytes: b.estimated_size_in_bytes ?? 0,
          tripped: b.tripped ?? 0,
        };
      }
      return { nodeName: node.name, breakers };
    });
  } catch { return undefined; }
}

async function collectIndexFieldCounts(client: OpenSearchTarget["client"]): Promise<IndexFieldCount[] | undefined> {
  try {
    const settingsRes = await client.indices.getSettings({ index: "*", name: "index.mapping.total_fields.limit" });
    const mappingsRes = await client.indices.getMapping({ index: "*" });
    const settings = settingsRes.body as Record<string, { settings?: { index?: { mapping?: { total_fields?: { limit?: string } } } } }>;
    const mappings = mappingsRes.body as Record<string, { mappings?: { properties?: Record<string, unknown> } }>;

    const results: IndexFieldCount[] = [];
    for (const [index, mapping] of Object.entries(mappings)) {
      if (index.startsWith(".")) continue;
      const fieldCount = countFields(mapping.mappings?.properties ?? {});
      const limit = parseInt(settings[index]?.settings?.index?.mapping?.total_fields?.limit ?? "1000", 10);
      results.push({ index, fieldCount, fieldLimit: limit });
    }
    return results;
  } catch { return undefined; }
}

function countFields(properties: Record<string, unknown>, depth = 0): number {
  if (depth > 10) return 0;
  let count = 0;
  for (const val of Object.values(properties)) {
    count += 1;
    const nested = (val as { properties?: Record<string, unknown> }).properties;
    if (nested) count += countFields(nested, depth + 1);
  }
  return count;
}

async function collectIsmStatuses(client: OpenSearchTarget["client"]): Promise<IsmStatus[] | undefined> {
  try {
    const res = await client.transport.request({
      method: "GET",
      path: "/_plugins/_ism/explain/*",
    });
    const body = res.body as Record<string, unknown>;
    const results: IsmStatus[] = [];
    for (const [index, val] of Object.entries(body)) {
      if (index === "total_managed_indices") continue;
      const v = val as { policy_id?: string; state?: { name?: string }; retry_info?: { failed?: boolean; message?: string } } | undefined;
      if (!v || typeof v !== "object") continue;
      results.push({
        index,
        policyId: v.policy_id ?? null,
        state: v.state?.name ?? null,
        failed: v.retry_info?.failed ?? false,
        info: v.retry_info?.message,
      });
    }
    return results;
  } catch { return undefined; }
}
