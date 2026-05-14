import type { ClusterSnapshot } from "@osa/diagnostics-core";
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

  const [[healthRes, nodesRes, shardsRes, indicesRes, allocRes], cwSeries] =
    await Promise.all([osCalls, cwCall]);

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
  };
}
