// Typed shape of the data each diagnostic reads. Comes from a small set of
// OpenSearch APIs so we can fixture-test diagnostics without any I/O.

export interface ClusterHealth {
  cluster_name: string;
  status: "green" | "yellow" | "red";
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
  delayed_unassigned_shards: number;
}

export interface NodeStat {
  name: string;
  roles: string[];
  /** GET /_nodes/stats — jvm.mem fields. */
  jvm?: {
    mem: {
      heap_used_percent: number;
      heap_used_in_bytes: number;
      heap_max_in_bytes: number;
    };
  };
  os?: {
    cpu?: { percent?: number };
  };
  process?: {
    cpu?: { percent?: number };
  };
  fs?: {
    total: { total_in_bytes: number; available_in_bytes: number };
  };
}

export interface NodesStats {
  nodes: Record<string, NodeStat>;
}

/** GET /_cat/shards?format=json */
export interface CatShard {
  index: string;
  shard: string;
  prirep: "p" | "r";
  state: string;
  docs: string | null;
  store: string | null;
  ip?: string;
  node?: string;
}

/** GET /_cat/indices?format=json&bytes=b */
export interface CatIndex {
  health: "green" | "yellow" | "red";
  status: string;
  index: string;
  uuid: string;
  pri: string;
  rep: string;
  "docs.count": string;
  "docs.deleted": string;
  "store.size": string;
  "pri.store.size": string;
  "creation.date"?: string;
}

/** GET /_cat/allocation?format=json&bytes=b */
export interface CatAllocation {
  shards: string;
  "disk.indices": string;
  "disk.used": string;
  "disk.avail": string;
  "disk.total": string;
  "disk.percent": string;
  host?: string;
  ip?: string;
  node?: string;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
}
export type MetricSeries = MetricDataPoint[];

/** CloudWatch series, keyed by metric. Optional — diagnostics handle absence. */
export interface ClusterMetrics {
  /** Window covered by these series (e.g. "24h"). */
  window: string;
  /** Period in seconds for each datapoint. */
  periodSec: number;
  jvmMemoryPressure: MetricSeries;
  cpuUtilization: MetricSeries;
  http5xx: MetricSeries;
  openSearchRequests: MetricSeries;
  indexingLatency: MetricSeries;
  searchLatency: MetricSeries;
  freeStorageSpace: MetricSeries;
  clusterStatusRed: MetricSeries;
  clusterStatusYellow: MetricSeries;
  automatedSnapshotFailure: MetricSeries;
  burstBalance: MetricSeries;
  threadpoolSearchRejected: MetricSeries;
  threadpoolWriteRejected: MetricSeries;
}

/** GET /_nodes/stats/thread_pool */
export interface ThreadPoolStats {
  nodeName: string;
  search: { rejected: number; completed: number; queue: number };
  write: { rejected: number; completed: number; queue: number };
}

/** GET /_nodes/stats/breaker */
export interface BreakerStats {
  nodeName: string;
  breakers: Record<string, {
    limit_size_in_bytes: number;
    estimated_size_in_bytes: number;
    tripped: number;
  }>;
}

/** Per-index field count from GET /<index>/_mapping */
export interface IndexFieldCount {
  index: string;
  fieldCount: number;
  fieldLimit: number;
}

/** Per-index ISM status from GET /_plugins/_ism/explain */
export interface IsmStatus {
  index: string;
  policyId: string | null;
  state: string | null;
  failed: boolean;
  info?: string;
}

export interface ClusterSnapshot {
  domainId: string;
  collectedAt: string;
  clusterHealth: ClusterHealth;
  nodesStats: NodesStats;
  catShards: CatShard[];
  catIndices: CatIndex[];
  catAllocation: CatAllocation[];
  /** Optional — present only when the scan was passed CloudWatch credentials. */
  metrics?: ClusterMetrics;
  /** Thread pool rejection/queue stats per node. */
  threadPoolStats?: ThreadPoolStats[];
  /** Circuit breaker stats per node. */
  breakerStats?: BreakerStats[];
  /** Field counts per non-system index. */
  indexFieldCounts?: IndexFieldCount[];
  /** ISM policy status per index. */
  ismStatuses?: IsmStatus[];
}
