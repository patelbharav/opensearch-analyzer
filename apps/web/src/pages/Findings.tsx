import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useDomainSelection } from "../useDomainSelection.js";
import Alert from "@cloudscape-design/components/alert";
import AppLayout from "@cloudscape-design/components/app-layout";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import SplitPanel from "@cloudscape-design/components/split-panel";
import Table from "@cloudscape-design/components/table";
import { api } from "../api.js";
import type { Finding, Severity } from "@osa/shared-types";
import { ApplyFixModal } from "../components/ApplyFixModal.js";

const SEVERITY_BADGE: Record<Severity, "red" | "severity-high" | "severity-medium" | "severity-low" | "blue"> = {
  critical: "red",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

export function FindingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { domains, selectedDomainId, setSelectedDomainId } = useDomainSelection();
  const effectiveDomainId = selectedDomainId;
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [fixTargetId, setFixTargetId] = useState<string | null>(null);

  // Load active SOP policies for the selected domain.
  const sopQuery = useQuery({
    queryKey: ["sop"],
    queryFn: () => api.listSopRuleSets(),
  });
  const allPolicies = sopQuery.data?.ruleSets ?? [];
  const activePolicies = useMemo(
    () =>
      allPolicies.filter(
        (rs) =>
          rs.enabled &&
          effectiveDomainId &&
          rs.domainIds.includes(effectiveDomainId),
      ),
    [allPolicies, effectiveDomainId],
  );

  const findingsQuery = useQuery({
    queryKey: ["findings", effectiveDomainId],
    queryFn: () =>
      effectiveDomainId
        ? api.listFindings(effectiveDomainId)
        : Promise.resolve({ findings: [] }),
    enabled: !!effectiveDomainId,
  });

  const scanMutation = useMutation({
    mutationFn: (id: string) => api.scan(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["findings", effectiveDomainId] });
      void qc.invalidateQueries({ queryKey: ["domains"] });
      setSelectedFindingId(null);
    },
  });

  const findings = findingsQuery.data?.findings ?? [];
  const selectedFinding = useMemo(
    () => findings.find((f) => f.id === selectedFindingId) ?? null,
    [findings, selectedFindingId],
  );
  const fixTarget = useMemo(
    () => findings.find((f) => f.id === fixTargetId) ?? null,
    [findings, fixTargetId],
  );
  const sorted = useMemo(
    () =>
      [...findings].sort(
        (a, b) =>
          severityRank(a.severity) - severityRank(b.severity) ||
          a.diagnosticId.localeCompare(b.diagnosticId),
      ),
    [findings],
  );

  // Counts for the header summary.
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of sorted) c[f.severity]++;
    return c;
  }, [sorted]);

  const domainOptions: SelectProps.Option[] = domains.map((d) => ({
    label: `${d.name} (${d.region})`,
    value: d.id,
  }));
  const selectedDomainOption =
    domainOptions.find((o) => o.value === effectiveDomainId) ?? null;

  return (
    <AppLayout
      navigationHide
      toolsHide
      contentType="table"
      maxContentWidth={Number.MAX_SAFE_INTEGER}
      splitPanelOpen={!!selectedFinding}
      onSplitPanelToggle={(e) => {
        if (!e.detail.open) setSelectedFindingId(null);
      }}
      splitPanelPreferences={{ position: "bottom" }}
      splitPanel={
        selectedFinding ? (
          <SplitPanel
            header={selectedFinding.title}
            i18nStrings={{
              preferencesTitle: "Split panel preferences",
              preferencesPositionLabel: "Split panel position",
              preferencesPositionDescription: "Choose the default split panel position.",
              preferencesPositionSide: "Side",
              preferencesPositionBottom: "Bottom",
              preferencesConfirm: "Confirm",
              preferencesCancel: "Cancel",
              closeButtonAriaLabel: "Close panel",
              openButtonAriaLabel: "Open panel",
              resizeHandleAriaLabel: "Resize panel",
            }}
          >
            <FindingDetail
              finding={selectedFinding}
              onApplyFix={() => setFixTargetId(selectedFinding.id)}
            />
          </SplitPanel>
        ) : undefined
      }
      content={
        <ContentLayout
          header={
            <Header
              variant="h1"
              description="Diagnostic findings for the selected domain. Click a row for details."
              counter={
                sorted.length > 0
                  ? `(${sorted.length})`
                  : undefined
              }
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
                  <Button
                    disabled={!effectiveDomainId || scanMutation.isPending}
                    loading={scanMutation.isPending}
                    iconName="refresh"
                    variant="primary"
                    onClick={() => effectiveDomainId && scanMutation.mutate(effectiveDomainId)}
                  >
                    Scan now
                  </Button>
                </SpaceBetween>
              }
            >
              Findings
            </Header>
          }
        >
          <SpaceBetween size="m">
            <Container>
              <ColumnLayout columns={4} variant="text-grid">
                <CountBox label="Critical" count={counts.critical} severity="critical" />
                <CountBox label="High" count={counts.high} severity="high" />
                <CountBox label="Medium" count={counts.medium} severity="medium" />
                <CountBox label="Low" count={counts.low} severity="low" />
              </ColumnLayout>
            </Container>

            {/* Active policies indicator */}
            <Container>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                  <Box variant="awsui-key-label">Custom policies:</Box>
                  {activePolicies.length === 0 ? (
                    <Box color="text-body-secondary">None applied to this domain</Box>
                  ) : (
                    activePolicies.map((p) => (
                      <Badge key={p.id} color="blue">{p.name} ({p.rules.length} rules)</Badge>
                    ))
                  )}
                </SpaceBetween>
                <Button variant="link" onClick={() => navigate("/policies")}>
                  Manage policies
                </Button>
              </div>
            </Container>

            {scanMutation.isError && (
              <Alert type="error" header="Scan failed">
                {scanMutation.error instanceof Error
                  ? scanMutation.error.message
                  : String(scanMutation.error)}
              </Alert>
            )}
            {scanMutation.isSuccess && (
              <Alert type="success" dismissible onDismiss={() => scanMutation.reset()}>
                Scan completed — {scanMutation.data.findings.length} finding(s).
              </Alert>
            )}

            <Table
              loading={findingsQuery.isLoading || scanMutation.isPending}
              loadingText={scanMutation.isPending ? "Scanning cluster…" : "Loading…"}
              items={sorted}
              trackBy="id"
              variant="full-page"
              selectionType="single"
              selectedItems={selectedFinding ? [selectedFinding] : []}
              onSelectionChange={(e) =>
                setSelectedFindingId(e.detail.selectedItems[0]?.id ?? null)
              }
              columnDefinitions={[
                {
                  id: "severity",
                  header: "Severity",
                  cell: (f) => (
                    <Badge color={SEVERITY_BADGE[f.severity]}>
                      {f.severity.toUpperCase()}
                    </Badge>
                  ),
                  width: 110,
                },
                {
                  id: "title",
                  header: "Issue",
                  cell: (f) => f.title,
                  isRowHeader: true,
                },
                {
                  id: "category",
                  header: "Category",
                  cell: (f) => f.category,
                  width: 120,
                },
                {
                  id: "fixable",
                  header: "Fix",
                  cell: (f) =>
                    f.fix?.kind === "apiCall" ? (
                      f.appliedAt ? (
                        <Badge color="green">applied</Badge>
                      ) : (
                        <Badge color="blue">one-click</Badge>
                      )
                    ) : f.fix?.kind === "guidance" ? (
                      <Badge color="grey">manual</Badge>
                    ) : (
                      ""
                    ),
                  width: 110,
                },
                {
                  id: "diagnosticId",
                  header: "Diagnostic",
                  cell: (f) => <code style={{ fontSize: 12 }}>{f.diagnosticId}</code>,
                  width: 200,
                },
              ]}
              empty={
                <Box textAlign="center" color="inherit" padding={{ vertical: "xxl" }}>
                  <SpaceBetween size="m">
                    <Box fontSize="display-l" color="text-status-success">✓</Box>
                    <Box variant="h2" color="inherit">
                      {effectiveDomainId ? "All clear" : "No domain selected"}
                    </Box>
                    <Box variant="p" color="text-body-secondary">
                      {effectiveDomainId
                        ? "Last scan found no issues. Click Scan now to re-run all 14 diagnostics."
                        : "Connect a domain on the Domains page to start scanning."}
                    </Box>
                  </SpaceBetween>
                </Box>
              }
            />
          </SpaceBetween>

          {fixTarget && (
            <ApplyFixModal
              finding={fixTarget}
              visible={!!fixTarget}
              onDismiss={() => setFixTargetId(null)}
              onApplied={() => {
                void qc.invalidateQueries({
                  queryKey: ["findings", effectiveDomainId],
                });
              }}
            />
          )}
        </ContentLayout>
      }
    />
  );
}

function CountBox({
  label,
  count,
  severity,
}: {
  label: string;
  count: number;
  severity: Severity;
}) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box
        variant="h2"
        color={
          count > 0
            ? severity === "critical"
              ? "text-status-error"
              : severity === "high"
                ? "text-status-warning"
                : "inherit"
            : "text-status-inactive"
        }
      >
        {count}
      </Box>
    </div>
  );
}

function FindingDetail({
  finding,
  onApplyFix,
}: {
  finding: Finding;
  onApplyFix: () => void;
}) {
  const severityColor =
    finding.severity === "critical"
      ? "#d13212"
      : finding.severity === "high"
        ? "#ff9900"
        : finding.severity === "medium"
          ? "#0073bb"
          : "#687078";
  return (
    <SpaceBetween size="l">
      {/* Severity-tinted band so context is obvious at a glance. */}
      <div
        style={{
          borderLeft: `4px solid ${severityColor}`,
          paddingLeft: 12,
          marginBottom: -8,
        }}
      >
        <Box variant="awsui-key-label" color="text-status-inactive">
          {finding.category.toUpperCase()} · {finding.severity.toUpperCase()}
        </Box>
        <Box variant="h2">{finding.title}</Box>
      </div>

      <KeyValuePairs
        columns={3}
        items={[
          { label: "Diagnostic", value: <code style={{ fontSize: 12 }}>{finding.diagnosticId}</code> },
          { label: "Detected at", value: new Date(finding.createdAt).toLocaleString() },
          {
            label: "Status",
            value: finding.appliedAt ? (
              <Badge color="green">FIX APPLIED</Badge>
            ) : finding.lastFixResult && !finding.lastFixResult.ok ? (
              <Badge color="red">APPLY FAILED</Badge>
            ) : finding.fix?.kind === "apiCall" ? (
              <Badge color="blue">FIXABLE</Badge>
            ) : (
              <Badge color="grey">MANUAL</Badge>
            ),
          },
        ]}
      />

      <Box>
        <Header variant="h3">What&apos;s wrong</Header>
        <Box variant="p">{finding.summary}</Box>
      </Box>

      {finding.fix && (
        <Box>
          <Header
            variant="h3"
            actions={
              finding.fix.kind === "apiCall" ? (
                <Button
                  variant="primary"
                  iconName="status-positive"
                  disabled={!!finding.appliedAt}
                  onClick={onApplyFix}
                >
                  {finding.appliedAt ? "Applied" : "Apply fix"}
                </Button>
              ) : null
            }
          >
            Recommended fix
          </Header>
          <Box variant="p">{finding.fix.description}</Box>

          {finding.fix.kind === "guidance" && finding.fix.steps.length > 0 && (
            <ul style={{ marginTop: 8 }}>
              {finding.fix.steps.map((s, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{s}</li>
              ))}
            </ul>
          )}

          {finding.fix.kind === "apiCall" && (
            <Box margin={{ top: "s" }}>
              <Box variant="awsui-key-label">Request that will be sent</Box>
              <pre style={{
                margin: 0, padding: 12, background: "#f4f4f4",
                borderRadius: 4, fontSize: 12, overflow: "auto",
              }}>
                {finding.fix.payload.method} {finding.fix.payload.path}
                {finding.fix.payload.body
                  ? "\n\n" + JSON.stringify(finding.fix.payload.body, null, 2)
                  : ""}
              </pre>
              {finding.fix.confirmationRequired && (
                <Box color="text-status-warning" margin={{ top: "xs" }}>
                  ⚠ Confirmation required before applying.
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      {finding.lastFixResult && (
        <Alert
          type={finding.lastFixResult.ok ? "success" : "error"}
          header={
            finding.lastFixResult.ok ? "Fix applied" : "Last apply attempt failed"
          }
        >
          <SpaceBetween size="xs">
            <Box>
              At {new Date(finding.lastFixResult.appliedAt).toLocaleString()}
              {finding.lastFixResult.statusCode &&
                ` · status ${finding.lastFixResult.statusCode}`}
            </Box>
            {finding.lastFixResult.error && <Box>{finding.lastFixResult.error}</Box>}
            {finding.lastFixResult.auditKey && (
              <Box>
                Audit log: <code>{finding.lastFixResult.auditKey}</code>
              </Box>
            )}
          </SpaceBetween>
        </Alert>
      )}

      <Box>
        <Header variant="h3">Evidence</Header>
        <pre style={{
          margin: 0, padding: 12, background: "#f4f4f4",
          borderRadius: 4, fontSize: 11, overflow: "auto", maxHeight: 320,
        }}>
          {JSON.stringify(finding.evidence, null, 2)}
        </pre>
      </Box>
    </SpaceBetween>
  );
}

function severityRank(s: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s];
}
