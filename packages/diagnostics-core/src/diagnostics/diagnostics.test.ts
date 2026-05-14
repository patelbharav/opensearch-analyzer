import { describe, expect, it } from "vitest";
import type { CatAllocation, CatIndex, ClusterMetrics, ClusterSnapshot, NodeStat } from "../snapshot.js";
import { runAllDiagnostics } from "../index.js";

function emptyMetrics(overrides: Partial<ClusterMetrics> = {}): ClusterMetrics {
  return {
    window: "24h",
    periodSec: 300,
    jvmMemoryPressure: [],
    cpuUtilization: [],
    openSearchRequests: [],
    http5xx: [],
    indexingLatency: [],
    searchLatency: [],
    freeStorageSpace: [],
    clusterStatusRed: [],
    clusterStatusYellow: [],
    automatedSnapshotFailure: [],
    burstBalance: [],
    threadpoolSearchRejected: [],
    threadpoolWriteRejected: [],
    ...overrides,
  };
}

const NOW = new Date("2026-05-13T00:00:00Z");
const CTX = { domainId: "d1", now: NOW };

function emptySnapshot(overrides: Partial<ClusterSnapshot> = {}): ClusterSnapshot {
  return {
    domainId: "d1",
    collectedAt: NOW.toISOString(),
    clusterHealth: {
      cluster_name: "test",
      status: "green",
      number_of_nodes: 3,
      number_of_data_nodes: 3,
      active_primary_shards: 0,
      active_shards: 0,
      relocating_shards: 0,
      initializing_shards: 0,
      unassigned_shards: 0,
      delayed_unassigned_shards: 0,
    },
    nodesStats: { nodes: {} },
    catShards: [],
    catIndices: [],
    catAllocation: [],
    ...overrides,
  };
}

function node(name: string, heapPct: number, cpuPct = 5): [string, NodeStat] {
  return [
    name,
    {
      name,
      roles: ["data"],
      jvm: { mem: { heap_used_percent: heapPct, heap_used_in_bytes: 0, heap_max_in_bytes: 0 } },
      os: { cpu: { percent: cpuPct } },
      fs: { total: { total_in_bytes: 1, available_in_bytes: 1 } },
    },
  ];
}

function index(over: Partial<CatIndex>): CatIndex {
  return {
    health: "green",
    status: "open",
    index: "idx",
    uuid: "u",
    pri: "1",
    rep: "1",
    "docs.count": "0",
    "docs.deleted": "0",
    "store.size": "0",
    "pri.store.size": "0",
    ...over,
  };
}

function alloc(node: string, shards: number, diskPct = 50): CatAllocation {
  return {
    shards: String(shards),
    "disk.indices": "0",
    "disk.used": "0",
    "disk.avail": "0",
    "disk.total": "0",
    "disk.percent": String(diskPct),
    node,
  };
}

describe("diagnostics", () => {
  it("green cluster yields no findings", () => {
    expect(runAllDiagnostics(emptySnapshot(), CTX)).toEqual([]);
  });

  it("red cluster fires cluster-red", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        clusterHealth: { ...emptySnapshot().clusterHealth, status: "red", unassigned_shards: 3 },
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("cluster-red");
  });

  it("yellow cluster fires cluster-yellow", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        clusterHealth: { ...emptySnapshot().clusterHealth, status: "yellow", unassigned_shards: 1 },
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("cluster-yellow");
  });

  it("jvm pressure flags nodes above 80%", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        nodesStats: { nodes: Object.fromEntries([node("a", 50), node("b", 95)]) },
      }),
      CTX,
    );
    const f = findings.find((x) => x.diagnosticId === "jvm-pressure");
    expect(f?.severity).toBe("critical");
  });

  it("cpu utilization flags nodes above 75%", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        nodesStats: { nodes: Object.fromEntries([node("a", 30, 80)]) },
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("cpu-utilization");
  });

  it("oversized-shards flags >50 GiB primaries", () => {
    const sixty = String(60 * 1024 * 1024 * 1024);
    const findings = runAllDiagnostics(
      emptySnapshot({
        catIndices: [index({ index: "big", pri: "1", "pri.store.size": sixty })],
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("oversized-shards");
  });

  it("undersized-shards needs at least 5 tiny indices", () => {
    const tiny = String(100 * 1024 * 1024); // 100MB
    const tinyIdx = (n: number) =>
      index({ index: `tiny${n}`, pri: "1", "pri.store.size": tiny, "docs.count": "10000" });

    const four = runAllDiagnostics(
      emptySnapshot({ catIndices: [tinyIdx(1), tinyIdx(2), tinyIdx(3), tinyIdx(4)] }),
      CTX,
    );
    expect(four.map((f) => f.diagnosticId)).not.toContain("undersized-shards");

    const five = runAllDiagnostics(
      emptySnapshot({
        catIndices: [tinyIdx(1), tinyIdx(2), tinyIdx(3), tinyIdx(4), tinyIdx(5)],
      }),
      CTX,
    );
    expect(five.map((f) => f.diagnosticId)).toContain("undersized-shards");
  });

  it("misconfigured-replicas flags replicas > nodes-1", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        catIndices: [index({ index: "over", pri: "1", rep: "5" })],
      }),
      CTX,
    );
    const f = findings.find((x) => x.diagnosticId === "misconfigured-replicas");
    expect(f).toBeDefined();
    expect(f?.fix?.kind).toBe("apiCall");
  });

  it("misconfigured-replicas flags replicas=0 on multi-node clusters", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        catIndices: [index({ index: "noreplicas", pri: "1", rep: "0" })],
      }),
      CTX,
    );
    expect(findings.find((f) => f.diagnosticId === "misconfigured-replicas")?.severity).toBe(
      "medium",
    );
  });

  it("misconfigured-replicas does NOT fire on single-node clusters with replicas=0", () => {
    const single = emptySnapshot();
    single.clusterHealth.number_of_data_nodes = 1;
    const findings = runAllDiagnostics(
      { ...single, catIndices: [index({ index: "ok", pri: "1", rep: "0" })] },
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).not.toContain("misconfigured-replicas");
  });

  it("node-shard-skew flags >15% coefficient of variation", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        catAllocation: [alloc("n1", 100), alloc("n2", 100), alloc("n3", 50)],
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("node-shard-skew");
  });

  it("disk-space flags >=80% disk usage", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        catAllocation: [alloc("n1", 50, 92), alloc("n2", 50, 60)],
      }),
      CTX,
    );
    const f = findings.find((x) => x.diagnosticId === "disk-space");
    expect(f?.severity).toBe("critical");
  });

  it("unused-indices needs at least 3 stale indices", () => {
    const oldDate = String(new Date("2026-01-01").getTime()); // ~4 months ago
    const stale = (n: number) =>
      index({ index: `stale${n}`, "creation.date": oldDate, "docs.count": "1" });

    const findings = runAllDiagnostics(
      emptySnapshot({ catIndices: [stale(1), stale(2), stale(3)] }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("unused-indices");
  });

  it("metrics diagnostics do nothing when metrics absent", () => {
    const findings = runAllDiagnostics(emptySnapshot(), CTX);
    const ids = findings.map((f) => f.diagnosticId);
    expect(ids).not.toContain("http-5xx-rate");
    expect(ids).not.toContain("indexing-latency");
    expect(ids).not.toContain("search-latency");
  });

  it("http-5xx-rate fires above 10% with enough requests", () => {
    const ts = "2026-05-13T00:00:00Z";
    const findings = runAllDiagnostics(
      emptySnapshot({
        metrics: emptyMetrics({
          openSearchRequests: [{ timestamp: ts, value: 10000 }],
          http5xx: [{ timestamp: ts, value: 1500 }], // 15%
        }),
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("http-5xx-rate");
  });

  it("http-5xx-rate ignores idle clusters under MIN_REQUESTS", () => {
    const ts = "2026-05-13T00:00:00Z";
    const findings = runAllDiagnostics(
      emptySnapshot({
        metrics: emptyMetrics({
          openSearchRequests: [{ timestamp: ts, value: 50 }],
          http5xx: [{ timestamp: ts, value: 50 }], // 100% but only 50 reqs
        }),
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).not.toContain("http-5xx-rate");
  });

  it("indexing-latency fires above 1s avg", () => {
    const ts = "2026-05-13T00:00:00Z";
    const findings = runAllDiagnostics(
      emptySnapshot({
        metrics: emptyMetrics({
          indexingLatency: [
            { timestamp: ts, value: 1500 },
            { timestamp: ts, value: 2000 },
          ],
        }),
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("indexing-latency");
  });

  it("search-latency fires above 500ms avg", () => {
    const ts = "2026-05-13T00:00:00Z";
    const findings = runAllDiagnostics(
      emptySnapshot({
        metrics: emptyMetrics({
          searchLatency: [
            { timestamp: ts, value: 800 },
            { timestamp: ts, value: 1200 },
          ],
        }),
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("search-latency");
  });

  // ---- New 8 high-priority diagnostics ----

  it("thread-pool-rejections fires on search rejections > 100", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        threadPoolStats: [
          { nodeName: "n1", search: { rejected: 500, completed: 1000, queue: 0 }, write: { rejected: 0, completed: 0, queue: 0 } },
        ],
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("thread-pool-rejections");
  });

  it("thread-pool-rejections does not fire on low counts", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        threadPoolStats: [
          { nodeName: "n1", search: { rejected: 5, completed: 1000, queue: 0 }, write: { rejected: 2, completed: 500, queue: 0 } },
        ],
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).not.toContain("thread-pool-rejections");
  });

  it("mapping-explosion fires at 80% of field limit", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        indexFieldCounts: [{ index: "big-mapping", fieldCount: 850, fieldLimit: 1000 }],
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("mapping-explosion");
  });

  it("mapping-explosion does not fire below 80%", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        indexFieldCounts: [{ index: "ok", fieldCount: 500, fieldLimit: 1000 }],
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).not.toContain("mapping-explosion");
  });

  it("ism-health fires on failed ISM policies", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        ismStatuses: [
          { index: "logs-2024-01", policyId: "cleanup", state: "delete", failed: true, info: "snapshot repo missing" },
        ],
      }),
      CTX,
    );
    const f = findings.find((x) => x.diagnosticId === "ism-health");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("high");
  });

  it("ism-health fires on many indices with no policy", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        ismStatuses: Array.from({ length: 6 }, (_, i) => ({
          index: `orphan-${i}`,
          policyId: null,
          state: null,
          failed: false,
        })),
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("ism-health");
  });

  it("snapshot-failures fires when CW shows failures", () => {
    const ts = "2026-05-13T00:00:00Z";
    const findings = runAllDiagnostics(
      emptySnapshot({
        metrics: emptyMetrics({
          automatedSnapshotFailure: [{ timestamp: ts, value: 1 }],
        }),
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("snapshot-failures");
  });

  it("circuit-breakers fires on tripped breakers", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        breakerStats: [{
          nodeName: "n1",
          breakers: {
            parent: { limit_size_in_bytes: 1e10, estimated_size_in_bytes: 9e9, tripped: 3 },
            fielddata: { limit_size_in_bytes: 5e9, estimated_size_in_bytes: 1e9, tripped: 0 },
          },
        }],
      }),
      CTX,
    );
    const f = findings.find((x) => x.diagnosticId === "circuit-breakers");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("critical"); // parent breaker tripped
  });

  it("ebs-burst-balance fires below 70%", () => {
    const ts = "2026-05-13T00:00:00Z";
    const findings = runAllDiagnostics(
      emptySnapshot({
        metrics: emptyMetrics({
          burstBalance: [{ timestamp: ts, value: 15 }],
        }),
      }),
      CTX,
    );
    const f = findings.find((x) => x.diagnosticId === "ebs-burst-balance");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("critical"); // below 20%
  });

  it("search-backpressure fires on CW rejection sum > 50", () => {
    const ts = "2026-05-13T00:00:00Z";
    const findings = runAllDiagnostics(
      emptySnapshot({
        metrics: emptyMetrics({
          threadpoolSearchRejected: [{ timestamp: ts, value: 100 }],
          threadpoolWriteRejected: [{ timestamp: ts, value: 20 }],
        }),
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("search-backpressure");
  });

  it("stuck-processing fires on many relocating shards", () => {
    const findings = runAllDiagnostics(
      emptySnapshot({
        clusterHealth: {
          ...emptySnapshot().clusterHealth,
          relocating_shards: 50,
          initializing_shards: 10,
          active_shards: 200,
        },
      }),
      CTX,
    );
    expect(findings.map((f) => f.diagnosticId)).toContain("stuck-processing");
  });
});
