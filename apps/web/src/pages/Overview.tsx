import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDomainSelection } from "../useDomainSelection.js";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
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
      <SpaceBetween size="m">
        {/* ---- Summary cards ---- */}
        {summary && (
          <Container header={<Header variant="h2">Health summary</Header>}>
            <ColumnLayout columns={4} variant="text-grid">
              <KV
                label="Cluster status"
                value={
                  summary.red ? (
                    <StatusIndicator type="error">RED</StatusIndicator>
                  ) : summary.yellow ? (
                    <StatusIndicator type="warning">YELLOW</StatusIndicator>
                  ) : (
                    <StatusIndicator type="success">GREEN</StatusIndicator>
                  )
                }
              />
              <KV
                label="JVM heap (peak)"
                value={`${Math.round(summary.jvmMax)}%`}
                bad={summary.jvmMax >= 80}
                threshold="< 80%"
              />
              <KV
                label="CPU (peak)"
                value={`${Math.round(summary.cpuMax)}%`}
                bad={summary.cpuMax >= 75}
                threshold="< 75%"
              />
              <KV
                label="5xx error rate"
                value={summary.totalRequests > 0 ? `${summary.fivexxRate.toFixed(2)}%` : "n/a"}
                bad={summary.totalRequests > 100 && summary.fivexxRate > 10}
                threshold="< 10%"
              />
            </ColumnLayout>
          </Container>
        )}

        {summary && (
          <Container header={<Header variant="h2">Performance</Header>}>
            <ColumnLayout columns={4} variant="text-grid">
              <KV label="Indexing latency (avg)" value={`${summary.indexingAvg.toFixed(1)} ms`} />
              <KV label="Search latency (avg)" value={`${summary.searchAvg.toFixed(1)} ms`} />
              <KV
                label="Free storage (min node)"
                value={`${(summary.freeStorageMin / 1024).toFixed(1)} GiB`}
              />
              <KV label="Total requests" value={Math.round(summary.totalRequests).toLocaleString()} />
            </ColumnLayout>
          </Container>
        )}

        {summary && (
          <Container header={<Header variant="h2">Stability</Header>}>
            <ColumnLayout columns={4} variant="text-grid">
              <KV
                label="Snapshot failures"
                value={summary.snapshotFailures > 0
                  ? <Badge color="red">{Math.round(summary.snapshotFailures)}</Badge>
                  : <Badge color="green">0</Badge>}
              />
              <KV
                label="EBS burst balance"
                value={summary.burstBalanceMin !== null
                  ? `${Math.round(summary.burstBalanceMin)}%`
                  : "n/a (gp3 or no data)"}
                bad={summary.burstBalanceMin !== null && summary.burstBalanceMin < 70}
                threshold="> 70%"
              />
              <KV
                label="Search rejections"
                value={summary.searchRejected > 0
                  ? <Badge color="red">{Math.round(summary.searchRejected)}</Badge>
                  : <Badge color="green">0</Badge>}
              />
              <KV
                label="Write rejections"
                value={summary.writeRejected > 0
                  ? <Badge color="red">{Math.round(summary.writeRejected)}</Badge>
                  : <Badge color="green">0</Badge>}
              />
            </ColumnLayout>
          </Container>
        )}

        {/* ---- Charts: core metrics ---- */}
        <Header variant="h2">Core metrics</Header>
        <ColumnLayout columns={2} variant="default">
          <Container header={<Header variant="h3">JVM heap pressure (%)</Header>}>
            <SeriesChart
              series={m?.jvmMemoryPressure}
              loading={metricsQuery.isLoading}
              ySuffix="%"
              thresholds={[{ value: 80, label: "Warn 80%" }, { value: 92, label: "Block 92%" }]}
            />
          </Container>
          <Container header={<Header variant="h3">CPU utilization (%)</Header>}>
            <SeriesChart
              series={m?.cpuUtilization}
              loading={metricsQuery.isLoading}
              ySuffix="%"
              thresholds={[{ value: 75, label: "Warn 75%" }]}
            />
          </Container>
          <Container header={<Header variant="h3">Free storage (MiB)</Header>}>
            <SeriesChart series={m?.freeStorageSpace} loading={metricsQuery.isLoading} ySuffix=" MiB" />
          </Container>
          <Container header={<Header variant="h3">Total requests / period</Header>}>
            <SeriesChart series={m?.openSearchRequests} loading={metricsQuery.isLoading} />
          </Container>
        </ColumnLayout>

        {/* ---- Charts: latency ---- */}
        <Header variant="h2">Latency</Header>
        <ColumnLayout columns={2} variant="default">
          <Container header={<Header variant="h3">Indexing latency (ms)</Header>}>
            <SeriesChart
              series={m?.indexingLatency}
              loading={metricsQuery.isLoading}
              ySuffix=" ms"
              thresholds={[{ value: 1000, label: "Warn 1s" }]}
            />
          </Container>
          <Container header={<Header variant="h3">Search latency (ms)</Header>}>
            <SeriesChart
              series={m?.searchLatency}
              loading={metricsQuery.isLoading}
              ySuffix=" ms"
              thresholds={[{ value: 500, label: "Warn 500ms" }]}
            />
          </Container>
        </ColumnLayout>

        {/* ---- Charts: errors & rejections ---- */}
        <Header variant="h2">Errors and rejections</Header>
        <ColumnLayout columns={2} variant="default">
          <Container header={<Header variant="h3">5xx errors / period</Header>}>
            <SeriesChart series={m?.http5xx} loading={metricsQuery.isLoading} />
          </Container>
          <Container header={<Header variant="h3">Search thread pool rejections / period</Header>}>
            <SeriesChart series={m?.threadpoolSearchRejected} loading={metricsQuery.isLoading} />
          </Container>
          <Container header={<Header variant="h3">Write thread pool rejections / period</Header>}>
            <SeriesChart series={m?.threadpoolWriteRejected} loading={metricsQuery.isLoading} />
          </Container>
          <Container header={<Header variant="h3">Automated snapshot failures</Header>}>
            <SeriesChart series={m?.automatedSnapshotFailure} loading={metricsQuery.isLoading} />
          </Container>
        </ColumnLayout>

        {/* ---- Charts: storage ---- */}
        <Header variant="h2">Storage</Header>
        <ColumnLayout columns={2} variant="default">
          <Container header={<Header variant="h3">EBS burst balance (%)</Header>}>
            <SeriesChart
              series={m?.burstBalance}
              loading={metricsQuery.isLoading}
              ySuffix="%"
              thresholds={[{ value: 70, label: "Warn 70%" }, { value: 20, label: "Critical 20%" }]}
            />
          </Container>
        </ColumnLayout>
      </SpaceBetween>
    </ContentLayout>
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
