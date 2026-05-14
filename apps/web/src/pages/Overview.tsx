import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDomainSelection } from "../useDomainSelection.js";
import Box from "@cloudscape-design/components/box";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import LineChart from "@cloudscape-design/components/line-chart";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SegmentedControl, {
  type SegmentedControlProps,
} from "@cloudscape-design/components/segmented-control";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { api } from "../api.js";
import type { MetricSeries } from "@osa/diagnostics-core";

type WindowKey = "1h" | "6h" | "24h" | "7d";

const WINDOW_OPTIONS: SegmentedControlProps.Option[] = [
  { id: "1h", text: "1 hour" },
  { id: "6h", text: "6 hours" },
  { id: "24h", text: "24 hours" },
  { id: "7d", text: "7 days" },
];

export function OverviewPage() {
  const { domains, selectedDomainId, setSelectedDomainId } = useDomainSelection();
  const effectiveDomainId = selectedDomainId;

  const [window, setWindow] = useState<WindowKey>("24h");

  const metricsQuery = useQuery({
    queryKey: ["metrics", effectiveDomainId, window],
    queryFn: () =>
      effectiveDomainId
        ? api.metrics(effectiveDomainId, window)
        : Promise.resolve(null),
    enabled: !!effectiveDomainId,
    refetchInterval: 60_000,
  });

  const m = metricsQuery.data?.metrics;

  const domainOptions: SelectProps.Option[] = domains.map((d) => ({
    label: `${d.name} (${d.region})`,
    value: d.id,
  }));
  const selectedDomainOption =
    domainOptions.find((o) => o.value === effectiveDomainId) ?? null;

  const summary = useMemo(() => {
    if (!m) return null;
    const totalReq = sumOf(m.openSearchRequests);
    const total5xx = sumOf(m.http5xx);
    return {
      jvmMax: maxOf(m.jvmMemoryPressure),
      cpuMax: maxOf(m.cpuUtilization),
      total5xx,
      totalRequests: totalReq,
      fivexxRate: totalReq > 0 ? (total5xx / totalReq) * 100 : 0,
      indexingAvg: avgOf(m.indexingLatency),
      searchAvg: avgOf(m.searchLatency),
      freeStorageMin: minOf(m.freeStorageSpace),
      red: maxOf(m.clusterStatusRed) > 0,
      yellow: maxOf(m.clusterStatusYellow) > 0,
      snapshotFailures: sumOf(m.automatedSnapshotFailure),
      burstBalanceMin: m.burstBalance.length > 0 ? minOf(m.burstBalance) : null,
      searchRejected: sumOf(m.threadpoolSearchRejected),
      writeRejected: sumOf(m.threadpoolWriteRejected),
    };
  }, [m]);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Live CloudWatch metrics. Auto-refreshes every 60 seconds."
          actions={
            <SpaceBetween direction="horizontal" size="xs" alignItems="end">
              <Box>
                <Box variant="awsui-key-label">Domain</Box>
                <Select
                  selectedOption={selectedDomainOption}
                  options={domainOptions}
                  placeholder={domains.length === 0 ? "No domains" : "Select"}
                  onChange={(e) =>
                    setSelectedDomainId(e.detail.selectedOption.value ?? null)
                  }
                  disabled={domains.length === 0}
                />
              </Box>
              <SegmentedControl
                selectedId={window}
                options={WINDOW_OPTIONS}
                onChange={(e) => setWindow(e.detail.selectedId as WindowKey)}
              />
            </SpaceBetween>
          }
        >
          Cluster overview
        </Header>
      }
    >
      <SpaceBetween size="l">
        {/* ---- Metric cards (always rendered for stable layout) ---- */}
        <div className="osa-section-header">Health</div>
        <div className="osa-stat-grid">
          <MetricCard label="Cluster status"
            value={summary ? (summary.red ? "RED" : summary.yellow ? "YELLOW" : "GREEN") : "—"}
            status={summary ? (summary.red ? "danger" : summary.yellow ? "warning" : "success") : undefined} />
          <MetricCard label="JVM heap (peak)"
            value={summary ? `${Math.round(summary.jvmMax)}%` : "—"}
            status={summary && summary.jvmMax >= 80 ? "danger" : undefined} threshold="< 80%" />
          <MetricCard label="CPU (peak)"
            value={summary ? `${Math.round(summary.cpuMax)}%` : "—"}
            status={summary && summary.cpuMax >= 75 ? "warning" : undefined} threshold="< 75%" />
          <MetricCard label="5xx error rate"
            value={summary ? (summary.totalRequests > 0 ? `${summary.fivexxRate.toFixed(2)}%` : "n/a") : "—"}
            status={summary && summary.fivexxRate > 10 ? "danger" : undefined} threshold="< 10%" />
        </div>

        <div className="osa-section-header">Performance</div>
        <div className="osa-stat-grid">
          <MetricCard label="Indexing latency" value={summary ? `${summary.indexingAvg.toFixed(1)} ms` : "—"} />
          <MetricCard label="Search latency" value={summary ? `${summary.searchAvg.toFixed(1)} ms` : "—"} />
          <MetricCard label="Free storage (min)" value={summary ? `${(summary.freeStorageMin / 1024).toFixed(1)} GiB` : "—"} />
          <MetricCard label="Total requests" value={summary ? Math.round(summary.totalRequests).toLocaleString() : "—"} />
        </div>

        <div className="osa-section-header">Stability</div>
        <div className="osa-stat-grid">
          <MetricCard label="Snapshot failures"
            value={summary ? String(Math.round(summary.snapshotFailures)) : "—"}
            status={summary && summary.snapshotFailures > 0 ? "danger" : summary ? "success" : undefined} />
          <MetricCard label="EBS burst balance"
            value={summary ? (summary.burstBalanceMin !== null ? `${Math.round(summary.burstBalanceMin)}%` : "n/a") : "—"}
            status={summary && summary.burstBalanceMin !== null && summary.burstBalanceMin < 70 ? "danger" : undefined}
            threshold="> 70%" />
          <MetricCard label="Search rejections"
            value={summary ? String(Math.round(summary.searchRejected)) : "—"}
            status={summary && summary.searchRejected > 0 ? "danger" : summary ? "success" : undefined} />
          <MetricCard label="Write rejections"
            value={summary ? String(Math.round(summary.writeRejected)) : "—"}
            status={summary && summary.writeRejected > 0 ? "danger" : summary ? "success" : undefined} />
        </div>

        {/* ---- Charts: core metrics ---- */}
        <div className="osa-section-header">Core metrics</div>
        <div className="osa-chart-grid">
          <div className="osa-chart-card"><h3>JVM heap pressure (%)</h3>
            <SeriesChart series={m?.jvmMemoryPressure} loading={metricsQuery.isLoading} ySuffix="%" thresholds={[{ value: 80, label: "Warn 80%" }, { value: 92, label: "Block 92%" }]} />
          </div>
          <div className="osa-chart-card"><h3>CPU utilization (%)</h3>
            <SeriesChart series={m?.cpuUtilization} loading={metricsQuery.isLoading} ySuffix="%" thresholds={[{ value: 75, label: "Warn 75%" }]} />
          </div>
          <div className="osa-chart-card"><h3>Free storage (MiB)</h3>
            <SeriesChart series={m?.freeStorageSpace} loading={metricsQuery.isLoading} ySuffix=" MiB" />
          </div>
          <div className="osa-chart-card"><h3>Total requests / period</h3>
            <SeriesChart series={m?.openSearchRequests} loading={metricsQuery.isLoading} />
          </div>
        </div>

        {/* ---- Charts: latency ---- */}
        <div className="osa-section-header">Latency</div>
        <div className="osa-chart-grid">
          <div className="osa-chart-card"><h3>Indexing latency (ms)</h3>
            <SeriesChart series={m?.indexingLatency} loading={metricsQuery.isLoading} ySuffix=" ms" thresholds={[{ value: 1000, label: "Warn 1s" }]} />
          </div>
          <div className="osa-chart-card"><h3>Search latency (ms)</h3>
            <SeriesChart series={m?.searchLatency} loading={metricsQuery.isLoading} ySuffix=" ms" thresholds={[{ value: 500, label: "Warn 500ms" }]} />
          </div>
        </div>

        {/* ---- Charts: errors & rejections ---- */}
        <div className="osa-section-header">Errors and rejections</div>
        <div className="osa-chart-grid">
          <div className="osa-chart-card"><h3>5xx errors / period</h3>
            <SeriesChart series={m?.http5xx} loading={metricsQuery.isLoading} />
          </div>
          <div className="osa-chart-card"><h3>Search rejections / period</h3>
            <SeriesChart series={m?.threadpoolSearchRejected} loading={metricsQuery.isLoading} />
          </div>
          <div className="osa-chart-card"><h3>Write rejections / period</h3>
            <SeriesChart series={m?.threadpoolWriteRejected} loading={metricsQuery.isLoading} />
          </div>
          <div className="osa-chart-card"><h3>Snapshot failures</h3>
            <SeriesChart series={m?.automatedSnapshotFailure} loading={metricsQuery.isLoading} />
          </div>
        </div>

        {/* ---- Charts: storage ---- */}
        <div className="osa-section-header">Storage</div>
        <div className="osa-chart-grid">
          <div className="osa-chart-card"><h3>EBS burst balance (%)</h3>
            <SeriesChart
              series={m?.burstBalance}
              loading={metricsQuery.isLoading}
              ySuffix="%"
              thresholds={[{ value: 70, label: "Warn 70%" }, { value: 20, label: "Critical 20%" }]}
            />
          </div>
        </div>
      </SpaceBetween>
    </ContentLayout>
  );
}

function MetricCard({
  label,
  value,
  status,
  threshold,
}: {
  label: string;
  value: string;
  status?: "danger" | "warning" | "success";
  threshold?: string;
}) {
  return (
    <div className="osa-metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value${status ? ` ${status}` : ""}`}>{value}</div>
      {threshold && <div className="metric-threshold">Threshold: {threshold}</div>}
    </div>
  );
}

function KV({
  label,
  value,
  bad,
  threshold,
}: {
  label: string;
  value: React.ReactNode;
  bad?: boolean;
  threshold?: string;
}) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box
        variant={bad ? "strong" : undefined}
        color={bad ? "text-status-error" : undefined}
        fontSize="heading-l"
      >
        {value}
      </Box>
      {threshold && (
        <Box variant="small" color="text-body-secondary">
          Threshold: {threshold}
        </Box>
      )}
    </div>
  );
}

interface SeriesChartProps {
  series: MetricSeries | undefined;
  loading: boolean;
  ySuffix?: string;
  thresholds?: { value: number; label: string }[];
}

function SeriesChart({ series, loading, ySuffix = "", thresholds = [] }: SeriesChartProps) {
  const data = (series ?? []).map((p) => ({ x: new Date(p.timestamp), y: p.value }));
  return (
    <LineChart
      series={[
        { title: "value", type: "line", data },
        ...thresholds.map((t) => ({
          title: t.label,
          type: "threshold" as const,
          y: t.value,
        })),
      ]}
      xDomain={
        data.length > 0
          ? [data[0]!.x, data[data.length - 1]!.x]
          : undefined
      }
      xScaleType="time"
      yTitle={ySuffix.trim() || undefined}
      hideFilter
      hideLegend={thresholds.length === 0}
      statusType={loading ? "loading" : "finished"}
      empty={
        <Box textAlign="center" color="inherit">
          <b>No data</b>
        </Box>
      }
      noMatch={<Box>No data points in the selected window.</Box>}
      height={200}
    />
  );
}

function maxOf(s: MetricSeries): number {
  return s.length === 0 ? 0 : Math.max(...s.map((p) => p.value));
}
function minOf(s: MetricSeries): number {
  return s.length === 0 ? 0 : Math.min(...s.map((p) => p.value));
}
function sumOf(s: MetricSeries): number {
  return s.reduce((a, p) => a + p.value, 0);
}
function avgOf(s: MetricSeries): number {
  return s.length === 0 ? 0 : sumOf(s) / s.length;
}
