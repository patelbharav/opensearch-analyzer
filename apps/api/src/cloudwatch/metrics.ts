import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import type { Domain } from "@osa/shared-types";
import { loadConfig } from "../config.js";

const config = loadConfig();

/** OpenSearch Service publishes metrics to the AWS/ES namespace. */
const NAMESPACE = "AWS/ES";

const cwCache = new Map<string, CloudWatchClient>();
function clientFor(region: string): CloudWatchClient {
  let c = cwCache.get(region);
  if (!c) {
    c = new CloudWatchClient({ region });
    cwCache.set(region, c);
  }
  return c;
}

export type WindowKey = "1h" | "6h" | "24h" | "7d";

interface WindowSpec {
  rangeMs: number;
  periodSec: number;
}
const WINDOWS: Record<WindowKey, WindowSpec> = {
  "1h":  { rangeMs:  60 * 60 * 1000,                periodSec:  60 },
  "6h":  { rangeMs:  6 * 60 * 60 * 1000,            periodSec: 300 },
  "24h": { rangeMs: 24 * 60 * 60 * 1000,            periodSec: 300 },
  "7d":  { rangeMs:  7 * 24 * 60 * 60 * 1000,       periodSec: 3600 },
};

export interface DataPoint {
  timestamp: string;
  value: number;
}
export type Series = DataPoint[];

export interface MetricSeriesSet {
  /** Maximum heap pressure across data nodes. */
  jvmMemoryPressure: Series;
  /** Maximum CPU across data nodes. */
  cpuUtilization: Series;
  /** Sum of 5xx responses. */
  http5xx: Series;
  /** Sum of total OpenSearchRequests. */
  openSearchRequests: Series;
  /** Average IndexingLatency (ms). */
  indexingLatency: Series;
  /** Average SearchLatency (ms). */
  searchLatency: Series;
  /** Minimum FreeStorageSpace (MiB) — minimum because ANY node low blocks writes. */
  freeStorageSpace: Series;
  /** Cluster status: 0 = green, 1 = yellow, 2 = red. */
  clusterStatusRed: Series;
  clusterStatusYellow: Series;
}

export interface FetchOpts {
  domain: Domain;
  window: WindowKey;
}

function domainNameFromArn(arn: string): string {
  // arn:aws:es:us-west-2:123:domain/<name>
  const m = arn.match(/:domain\/(.+?)(?:\/.*)?$/);
  if (!m) throw new Error(`Cannot extract domain name from ARN: ${arn}`);
  return m[1]!;
}

function accountIdFromArn(arn: string): string {
  const parts = arn.split(":");
  return parts[4] ?? "";
}

export async function fetchMetrics(opts: FetchOpts): Promise<MetricSeriesSet> {
  const { domain, window } = opts;
  const spec = WINDOWS[window];
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - spec.rangeMs);

  const dimensions = [
    { Name: "DomainName", Value: domainNameFromArn(domain.arn) },
    { Name: "ClientId", Value: accountIdFromArn(domain.arn) },
  ];

  const queries: MetricDataQuery[] = [
    metricQuery("jvmMemoryPressure",  "JVMMemoryPressure",  "Maximum", spec.periodSec, dimensions),
    metricQuery("cpuUtilization",     "CPUUtilization",     "Maximum", spec.periodSec, dimensions),
    metricQuery("http5xx",            "5xx",                "Sum",     spec.periodSec, dimensions),
    metricQuery("openSearchRequests", "OpenSearchRequests", "Sum",     spec.periodSec, dimensions),
    metricQuery("indexingLatency",    "IndexingLatency",    "Average", spec.periodSec, dimensions),
    metricQuery("searchLatency",      "SearchLatency",      "Average", spec.periodSec, dimensions),
    metricQuery("freeStorageSpace",   "FreeStorageSpace",   "Minimum", spec.periodSec, dimensions),
    metricQuery("clusterStatusRed",    "ClusterStatus.red",    "Maximum", spec.periodSec, dimensions),
    metricQuery("clusterStatusYellow", "ClusterStatus.yellow", "Maximum", spec.periodSec, dimensions),
  ];

  const cw = clientFor(domain.region);
  const res = await cw.send(
    new GetMetricDataCommand({
      StartTime: startTime,
      EndTime: endTime,
      ScanBy: "TimestampAscending",
      MetricDataQueries: queries,
    }),
  );

  const out: Partial<MetricSeriesSet> = {};
  for (const r of res.MetricDataResults ?? []) {
    const id = r.Id as keyof MetricSeriesSet;
    const series: Series = (r.Timestamps ?? []).map((ts, i) => ({
      timestamp: ts.toISOString(),
      value: r.Values?.[i] ?? 0,
    }));
    out[id] = series;
  }
  return {
    jvmMemoryPressure: out.jvmMemoryPressure ?? [],
    cpuUtilization: out.cpuUtilization ?? [],
    http5xx: out.http5xx ?? [],
    openSearchRequests: out.openSearchRequests ?? [],
    indexingLatency: out.indexingLatency ?? [],
    searchLatency: out.searchLatency ?? [],
    freeStorageSpace: out.freeStorageSpace ?? [],
    clusterStatusRed: out.clusterStatusRed ?? [],
    clusterStatusYellow: out.clusterStatusYellow ?? [],
  };
}

function metricQuery(
  id: string,
  metricName: string,
  stat: "Average" | "Sum" | "Minimum" | "Maximum",
  period: number,
  dimensions: { Name: string; Value: string }[],
): MetricDataQuery {
  return {
    Id: id,
    MetricStat: {
      Metric: {
        Namespace: NAMESPACE,
        MetricName: metricName,
        Dimensions: dimensions,
      },
      Period: period,
      Stat: stat,
    },
    ReturnData: true,
  };
}

// Suppress unused import warning if config isn't referenced yet (region comes from domain).
void config;
