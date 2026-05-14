import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEmbed } from "../embed.js";
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
  { id: "1h", text: "1h" },
  { id: "6h", text: "6h" },
  { id: "24h", text: "24h" },
  { id: "7d", text: "7d" },
];

export function OverviewPage() {
  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => api.listDomains(),
  });
  const domains = domainsQuery.data?.domains ?? [];
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const { parentDomainArn } = useEmbed();
  useEffect(() => {
    if (!parentDomainArn) return;
    const match = domains.find((d) => d.arn === parentDomainArn);
    if (match) setSelectedDomainId(match.id);
  }, [parentDomainArn, domains]);
  const effectiveDomainId =
    selectedDomainId ?? (domains.length > 0 ? domains[0]!.id : null);

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
    return {
      jvmMax: maxOf(m.jvmMemoryPressure),
      cpuMax: maxOf(m.cpuUtilization),
      total5xx: sumOf(m.http5xx),
      totalRequests: sumOf(m.openSearchRequests),
      indexingAvg: avgOf(m.indexingLatency),
      searchAvg: avgOf(m.searchLatency),
      freeStorageMin: minOf(m.freeStorageSpace),
      red: maxOf(m.clusterStatusRed) > 0,
      yellow: maxOf(m.clusterStatusYellow) > 0,
    };
  }, [m]);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Live CloudWatch metrics for the selected domain. Auto-refreshes every 60 s."
          actions={
            <SegmentedControl
              selectedId={window}
              options={WINDOW_OPTIONS}
              onChange={(e) => setWindow(e.detail.selectedId as WindowKey)}
            />
          }
        >
          Cluster overview
        </Header>
      }
    >
      <SpaceBetween size="m">
        <Box>
          <Select
            selectedOption={selectedDomainOption}
            options={domainOptions}
            placeholder={domains.length === 0 ? "No domains connected" : "Select a domain"}
            onChange={(e) => setSelectedDomainId(e.detail.selectedOption.value ?? null)}
            disabled={domains.length === 0}
          />
        </Box>

        {summary && (
          <Container header={<Header variant="h2">Summary ({window})</Header>}>
            <ColumnLayout columns={4} variant="text-grid">
              <KV
                label="Cluster status"
                value={
                  summary.red ? (
                    <StatusIndicator type="error">red</StatusIndicator>
                  ) : summary.yellow ? (
                    <StatusIndicator type="warning">yellow</StatusIndicator>
                  ) : (
                    <StatusIndicator type="success">green</StatusIndicator>
                  )
                }
              />
              <KV
                label="JVM heap (peak)"
                value={`${Math.round(summary.jvmMax)}%`}
                bad={summary.jvmMax >= 80}
              />
              <KV
                label="CPU (peak)"
                value={`${Math.round(summary.cpuMax)}%`}
                bad={summary.cpuMax >= 75}
              />
              <KV
                label="5xx rate"
                value={
                  summary.totalRequests > 0
                    ? `${((summary.total5xx / summary.totalRequests) * 100).toFixed(2)}%`
                    : "n/a"
                }
                bad={
                  summary.totalRequests > 100 &&
                  summary.total5xx / summary.totalRequests > 0.10
                }
              />
              <KV label="Indexing latency (avg)" value={`${summary.indexingAvg.toFixed(1)} ms`} />
              <KV label="Search latency (avg)" value={`${summary.searchAvg.toFixed(1)} ms`} />
              <KV
                label="Free storage (min)"
                value={`${(summary.freeStorageMin / 1024).toFixed(1)} GiB`}
              />
              <KV label="Total requests" value={String(summary.totalRequests)} />
            </ColumnLayout>
          </Container>
        )}

        <ColumnLayout columns={2} variant="default">
          <Container header={<Header variant="h3">JVM heap pressure</Header>}>
            <SeriesChart
              series={m?.jvmMemoryPressure}
              loading={metricsQuery.isLoading}
              ySuffix="%"
              thresholds={[{ value: 80, label: "Warn 80%" }]}
            />
          </Container>
          <Container header={<Header variant="h3">CPU utilization</Header>}>
            <SeriesChart
              series={m?.cpuUtilization}
              loading={metricsQuery.isLoading}
              ySuffix="%"
              thresholds={[{ value: 75, label: "Warn 75%" }]}
            />
          </Container>
          <Container header={<Header variant="h3">5xx errors per period</Header>}>
            <SeriesChart series={m?.http5xx} loading={metricsQuery.isLoading} />
          </Container>
          <Container header={<Header variant="h3">OpenSearch requests per period</Header>}>
            <SeriesChart series={m?.openSearchRequests} loading={metricsQuery.isLoading} />
          </Container>
          <Container header={<Header variant="h3">Indexing latency</Header>}>
            <SeriesChart
              series={m?.indexingLatency}
              loading={metricsQuery.isLoading}
              ySuffix=" ms"
            />
          </Container>
          <Container header={<Header variant="h3">Search latency</Header>}>
            <SeriesChart
              series={m?.searchLatency}
              loading={metricsQuery.isLoading}
              ySuffix=" ms"
            />
          </Container>
          <Container header={<Header variant="h3">Free storage (MiB, min across nodes)</Header>}>
            <SeriesChart series={m?.freeStorageSpace} loading={metricsQuery.isLoading} />
          </Container>
        </ColumnLayout>
      </SpaceBetween>
    </ContentLayout>
  );
}

function KV({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant={bad ? "strong" : undefined} color={bad ? "text-status-warning" : undefined}>
        {value}
      </Box>
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
      hideLegend
      statusType={loading ? "loading" : "finished"}
      empty={
        <Box textAlign="center" color="inherit">
          <b>No data</b>
        </Box>
      }
      noMatch={<Box>No data points in the selected window.</Box>}
      height={180}
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
