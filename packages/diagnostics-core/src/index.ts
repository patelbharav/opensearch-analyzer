import type { Finding } from "@osa/shared-types";
import type { ClusterSnapshot } from "./snapshot.js";
import { clusterRed } from "./diagnostics/clusterRed.js";
import { clusterYellow } from "./diagnostics/clusterYellow.js";
import { jvmPressure } from "./diagnostics/jvmPressure.js";
import { cpuUtilization } from "./diagnostics/cpuUtilization.js";
import { shardCount } from "./diagnostics/shardCount.js";
import { oversizedShards } from "./diagnostics/oversizedShards.js";
import { undersizedShards } from "./diagnostics/undersizedShards.js";
import { nodeShardSkew } from "./diagnostics/nodeShardSkew.js";
import { misconfiguredReplicas } from "./diagnostics/misconfiguredReplicas.js";
import { unusedIndices } from "./diagnostics/unusedIndices.js";
import { diskSpace } from "./diagnostics/diskSpace.js";
import { http5xxRate } from "./diagnostics/http5xxRate.js";
import { indexingLatency } from "./diagnostics/indexingLatency.js";
import { searchLatency } from "./diagnostics/searchLatency.js";
import { threadPoolRejections } from "./diagnostics/threadPoolRejections.js";
import { mappingExplosion } from "./diagnostics/mappingExplosion.js";
import { ismHealth } from "./diagnostics/ismHealth.js";
import { snapshotFailures } from "./diagnostics/snapshotFailures.js";
import { circuitBreakers } from "./diagnostics/circuitBreakers.js";
import { ebsBurstBalance } from "./diagnostics/ebsBurstBalance.js";
import { searchBackpressure } from "./diagnostics/searchBackpressure.js";
import { stuckProcessing } from "./diagnostics/stuckProcessing.js";

export type { ClusterSnapshot } from "./snapshot.js";
export type {
  BreakerStats,
  CatAllocation,
  CatIndex,
  CatShard,
  ClusterHealth,
  ClusterMetrics,
  IndexFieldCount,
  IsmStatus,
  MetricSeries,
  MetricDataPoint,
  NodeStat,
  NodesStats,
  ThreadPoolStats,
} from "./snapshot.js";

export interface DiagnosticContext {
  domainId: string;
  now: Date;
}

export type Diagnostic = (snapshot: ClusterSnapshot, ctx: DiagnosticContext) => Finding[];

export interface DiagnosticDef {
  id: string;
  title: string;
  run: Diagnostic;
}

export const diagnostics: DiagnosticDef[] = [
  clusterRed,
  clusterYellow,
  jvmPressure,
  cpuUtilization,
  shardCount,
  oversizedShards,
  undersizedShards,
  nodeShardSkew,
  misconfiguredReplicas,
  unusedIndices,
  diskSpace,
  // Metrics-based (fire only when snapshot.metrics is populated)
  http5xxRate,
  indexingLatency,
  searchLatency,
  // New high-priority diagnostics
  threadPoolRejections,
  mappingExplosion,
  ismHealth,
  snapshotFailures,
  circuitBreakers,
  ebsBurstBalance,
  searchBackpressure,
  stuckProcessing,
];

export function runAllDiagnostics(
  snapshot: ClusterSnapshot,
  ctx: DiagnosticContext,
): Finding[] {
  return diagnostics.flatMap((d) => d.run(snapshot, ctx));
}

export { newFindingId } from "./util.js";
export { evaluateSopRuleSet, type SopEvalContext } from "./sopEvaluator.js";
