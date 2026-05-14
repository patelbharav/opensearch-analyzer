import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import Tabs from "@cloudscape-design/components/tabs";
import Textarea from "@cloudscape-design/components/textarea";
import Toggle from "@cloudscape-design/components/toggle";
import { api } from "../api.js";
import type {
  CustomPolicy,
  NamingConvention,
  Severity,
  SopRule,
  SopRuleSet,
  ThresholdOverride,
} from "@osa/shared-types";

const SEVERITY_OPTIONS = [
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const DIAGNOSTIC_IDS = [
  "jvm-pressure", "cpu-utilization", "shard-count", "oversized-shards",
  "undersized-shards", "node-shard-skew", "disk-space", "http-5xx-rate",
  "indexing-latency", "search-latency", "ebs-burst-balance",
].map((v) => ({ label: v, value: v }));

const POLICY_TARGETS = [
  "index.replicas", "index.primaryShards", "index.fieldCount", "index.ageInDays",
  "index.storeSizeBytes", "index.shardSizeBytes", "index.name", "index.hasIsmPolicy",
  "node.heapUsedPercent", "node.cpuPercent", "node.diskPercent",
  "cluster.dataNodeCount", "cluster.totalShards",
].map((v) => ({ label: v, value: v }));

const OPERATORS = [
  "eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "matches",
].map((v) => ({ label: v, value: v }));

const SCOPES = [
  { label: "Per index", value: "index" },
  { label: "Per node", value: "node" },
  { label: "Cluster-wide", value: "cluster" },
];

export function PoliciesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sop"],
    queryFn: () => api.listSopRuleSets(),
  });
  const ruleSets = data?.ruleSets ?? [];
  const [selected, setSelected] = useState<SopRuleSet[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importYaml, setImportYaml] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSopRuleSet(id),
    onSuccess: () => { setSelected([]); void qc.invalidateQueries({ queryKey: ["sop"] }); },
  });

  const importMutation = useMutation({
    mutationFn: (yaml: string) => api.importSopYaml(yaml),
    onSuccess: () => {
      setImportOpen(false);
      setImportYaml("");
      void qc.invalidateQueries({ queryKey: ["sop"] });
    },
  });

  const handleExport = async () => {
    if (!selected[0]) return;
    const yaml = await api.exportSopYaml(selected[0].id);
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected[0].name.replace(/[^a-z0-9-_]/gi, "_")}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Define team best practices and SOPs. Findings are evaluated against these rules on every scan."
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setImportOpen(true)}>Import YAML</Button>
              <Button disabled={selected.length !== 1} onClick={handleExport}>Export YAML</Button>
              <Button disabled={selected.length !== 1} onClick={() => selected[0] && deleteMutation.mutate(selected[0].id)} loading={deleteMutation.isPending}>Delete</Button>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>Create rule set</Button>
            </SpaceBetween>
          }
        >
          Policies
        </Header>
      }
    >
      <SpaceBetween size="m">
        <Table
          loading={isLoading}
          items={ruleSets}
          trackBy="id"
          selectionType="single"
          selectedItems={selected}
          onSelectionChange={(e) => setSelected([...e.detail.selectedItems])}
          columnDefinitions={[
            { id: "name", header: "Name", cell: (r) => r.name, isRowHeader: true },
            { id: "rules", header: "Rules", cell: (r) => <Badge>{String(r.rules.length)}</Badge>, width: 80 },
            {
              id: "enabled", header: "Enabled", width: 100,
              cell: (r) => r.enabled
                ? <StatusIndicator type="success">Active</StatusIndicator>
                : <StatusIndicator type="stopped">Disabled</StatusIndicator>,
            },
            { id: "domains", header: "Applies to", cell: (r) => r.domainIds.length === 0 ? "All domains" : `${r.domainIds.length} domain(s)` },
            { id: "updated", header: "Updated", cell: (r) => new Date(r.updatedAt).toLocaleDateString(), width: 120 },
          ]}
          empty={
            <Box textAlign="center" color="inherit" padding={{ vertical: "xxl" }}>
              <SpaceBetween size="m">
                <Box variant="h2" color="inherit">No policies defined</Box>
                <Box variant="p" color="text-body-secondary">
                  Create a rule set to enforce team best practices. Rules are evaluated on every scan.
                </Box>
                <Button variant="primary" onClick={() => setCreateOpen(true)}>Create your first rule set</Button>
              </SpaceBetween>
            </Box>
          }
        />

        {createOpen && (
          <CreateRuleSetModal
            visible={createOpen}
            onDismiss={() => setCreateOpen(false)}
            onCreated={() => { setCreateOpen(false); void qc.invalidateQueries({ queryKey: ["sop"] }); }}
          />
        )}

        <Modal
          visible={importOpen}
          header="Import rule set from YAML"
          onDismiss={() => { setImportOpen(false); setImportYaml(""); }}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => { setImportOpen(false); setImportYaml(""); }} variant="link">Cancel</Button>
                <Button variant="primary" onClick={() => importMutation.mutate(importYaml)} loading={importMutation.isPending} disabled={!importYaml.trim()}>Import</Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <FormField label="Paste YAML" description="Exported from another instance or written by hand.">
              <Textarea value={importYaml} onChange={(e) => setImportYaml(e.detail.value)} rows={12} placeholder={SAMPLE_YAML} />
            </FormField>
            {importMutation.isError && (
              <Alert type="error">{importMutation.error instanceof Error ? importMutation.error.message : String(importMutation.error)}</Alert>
            )}
          </SpaceBetween>
        </Modal>
      </SpaceBetween>
    </ContentLayout>
  );
}

// ---- Create modal ----

function CreateRuleSetModal({ visible, onDismiss, onCreated }: { visible: boolean; onDismiss: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [rules, setRules] = useState<SopRule[]>([]);
  const [activeTab, setActiveTab] = useState("thresholds");
  const [error, setError] = useState<string | null>(null);

  // Threshold form
  const [tDiagId, setTDiagId] = useState(DIAGNOSTIC_IDS[0]!.value);
  const [tValue, setTValue] = useState("");
  const [tSeverity, setTSeverity] = useState<Severity>("high");

  // Policy form
  const [pName, setPName] = useState("");
  const [pScope, setPScope] = useState<"index" | "node" | "cluster">("index");
  const [pPattern, setPPattern] = useState("*");
  const [pTarget, setPTarget] = useState(POLICY_TARGETS[0]!.value);
  const [pOp, setPOp] = useState("gte");
  const [pValue, setPValue] = useState("");
  const [pSeverity, setPSeverity] = useState<Severity>("high");
  const [pMessage, setPMessage] = useState("");

  // Naming form
  const [nName, setNName] = useState("");
  const [nPattern, setNPattern] = useState("");
  const [nAppliesTo, setNAppliesTo] = useState("*");
  const [nSeverity, setNSeverity] = useState<Severity>("medium");
  const [nMessage, setNMessage] = useState("");

  const addThreshold = () => {
    if (!tValue) return;
    const rule: ThresholdOverride = { kind: "threshold", diagnosticId: tDiagId, value: Number(tValue), severity: tSeverity };
    setRules((prev) => [...prev, rule]);
    setTValue("");
  };

  const addPolicy = () => {
    if (!pName || !pValue || !pMessage) return;
    const rule: CustomPolicy = {
      kind: "policy", name: pName, scope: pScope,
      indexPattern: pScope === "index" ? pPattern : undefined,
      target: pTarget as CustomPolicy["target"],
      operator: pOp as CustomPolicy["operator"],
      value: isNaN(Number(pValue)) ? pValue : Number(pValue),
      severity: pSeverity, message: pMessage,
    };
    setRules((prev) => [...prev, rule]);
    setPName(""); setPValue(""); setPMessage("");
  };

  const addNaming = () => {
    if (!nName || !nPattern || !nMessage) return;
    const rule: NamingConvention = {
      kind: "naming", name: nName, pattern: nPattern,
      appliesTo: nAppliesTo, severity: nSeverity, message: nMessage,
    };
    setRules((prev) => [...prev, rule]);
    setNName(""); setNPattern(""); setNMessage("");
  };

  const removeRule = (i: number) => setRules((prev) => prev.filter((_, j) => j !== i));

  const createMutation = useMutation({
    mutationFn: () => api.createSopRuleSet({ name, description, domainIds: [], rules, enabled }),
    onSuccess: () => onCreated(),
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  return (
    <Modal visible={visible} header="Create rule set" size="large" onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onDismiss} variant="link">Cancel</Button>
            <Button variant="primary" onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!name || rules.length === 0}>
              Create ({rules.length} rule{rules.length !== 1 ? "s" : ""})
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {error && <Alert type="error">{error}</Alert>}
        <FormField label="Rule set name">
          <Input value={name} onChange={(e) => setName(e.detail.value)} placeholder="e.g. Production standards" />
        </FormField>
        <FormField label="Description (optional)">
          <Input value={description} onChange={(e) => setDescription(e.detail.value)} />
        </FormField>
        <Toggle checked={enabled} onChange={(e) => setEnabled(e.detail.checked)}>Enabled</Toggle>

        <Tabs activeTabId={activeTab} onChange={(e) => setActiveTab(e.detail.activeTabId)} tabs={[
          {
            id: "thresholds", label: "Threshold overrides",
            content: (
              <SpaceBetween size="s">
                <Box variant="p" color="text-body-secondary">Override the default warning threshold for a built-in diagnostic.</Box>
                <SpaceBetween direction="horizontal" size="xs">
                  <FormField label="Diagnostic">
                    <Select selectedOption={DIAGNOSTIC_IDS.find((o) => o.value === tDiagId)!} options={DIAGNOSTIC_IDS} onChange={(e) => setTDiagId(e.detail.selectedOption.value!)} />
                  </FormField>
                  <FormField label="Threshold value">
                    <Input type="number" value={tValue} onChange={(e) => setTValue(e.detail.value)} placeholder="70" />
                  </FormField>
                  <FormField label="Severity">
                    <Select selectedOption={SEVERITY_OPTIONS.find((o) => o.value === tSeverity)!} options={SEVERITY_OPTIONS} onChange={(e) => setTSeverity(e.detail.selectedOption.value as Severity)} />
                  </FormField>
                  <Box padding={{ top: "l" }}><Button onClick={addThreshold}>Add</Button></Box>
                </SpaceBetween>
              </SpaceBetween>
            ),
          },
          {
            id: "policies", label: "Custom policies",
            content: (
              <SpaceBetween size="s">
                <Box variant="p" color="text-body-secondary">Define if-then rules (e.g. "all prod indices must have replicas &gt;= 2").</Box>
                <FormField label="Rule name"><Input value={pName} onChange={(e) => setPName(e.detail.value)} placeholder="Min 2 replicas for prod" /></FormField>
                <SpaceBetween direction="horizontal" size="xs">
                  <FormField label="Scope"><Select selectedOption={SCOPES.find((o) => o.value === pScope)!} options={SCOPES} onChange={(e) => setPScope(e.detail.selectedOption.value as "index")} /></FormField>
                  {pScope === "index" && <FormField label="Index pattern"><Input value={pPattern} onChange={(e) => setPPattern(e.detail.value)} placeholder="prod-*" /></FormField>}
                  <FormField label="Target"><Select selectedOption={POLICY_TARGETS.find((o) => o.value === pTarget)!} options={POLICY_TARGETS} onChange={(e) => setPTarget(e.detail.selectedOption.value!)} /></FormField>
                  <FormField label="Operator"><Select selectedOption={OPERATORS.find((o) => o.value === pOp)!} options={OPERATORS} onChange={(e) => setPOp(e.detail.selectedOption.value!)} /></FormField>
                  <FormField label="Value"><Input value={pValue} onChange={(e) => setPValue(e.detail.value)} placeholder="2" /></FormField>
                  <FormField label="Severity"><Select selectedOption={SEVERITY_OPTIONS.find((o) => o.value === pSeverity)!} options={SEVERITY_OPTIONS} onChange={(e) => setPSeverity(e.detail.selectedOption.value as Severity)} /></FormField>
                </SpaceBetween>
                <FormField label="Violation message"><Input value={pMessage} onChange={(e) => setPMessage(e.detail.value)} placeholder="Index {index} must have at least 2 replicas" /></FormField>
                <Button onClick={addPolicy}>Add rule</Button>
              </SpaceBetween>
            ),
          },
          {
            id: "naming", label: "Naming conventions",
            content: (
              <SpaceBetween size="s">
                <Box variant="p" color="text-body-secondary">Enforce index naming patterns via regex.</Box>
                <FormField label="Convention name"><Input value={nName} onChange={(e) => setNName(e.detail.value)} placeholder="Daily index format" /></FormField>
                <SpaceBetween direction="horizontal" size="xs">
                  <FormField label="Regex pattern"><Input value={nPattern} onChange={(e) => setNPattern(e.detail.value)} placeholder="^logs-\\d{4}-\\d{2}-\\d{2}$" /></FormField>
                  <FormField label="Applies to (glob)"><Input value={nAppliesTo} onChange={(e) => setNAppliesTo(e.detail.value)} placeholder="logs-*" /></FormField>
                  <FormField label="Severity"><Select selectedOption={SEVERITY_OPTIONS.find((o) => o.value === nSeverity)!} options={SEVERITY_OPTIONS} onChange={(e) => setNSeverity(e.detail.selectedOption.value as Severity)} /></FormField>
                </SpaceBetween>
                <FormField label="Violation message"><Input value={nMessage} onChange={(e) => setNMessage(e.detail.value)} placeholder="Index {index} does not follow the logs-YYYY-MM-DD naming convention" /></FormField>
                <Button onClick={addNaming}>Add convention</Button>
              </SpaceBetween>
            ),
          },
        ]} />

        {rules.length > 0 && (
          <Container header={<Header variant="h3">Rules in this set ({rules.length})</Header>}>
            <Table
              items={rules}
              columnDefinitions={[
                { id: "kind", header: "Type", cell: (r) => <Badge>{r.kind}</Badge>, width: 100 },
                { id: "name", header: "Name/Target", cell: (r) => r.kind === "threshold" ? r.diagnosticId : r.name },
                { id: "detail", header: "Condition", cell: (r) => ruleDetail(r) },
                { id: "severity", header: "Severity", cell: (r) => ("severity" in r ? r.severity : "—"), width: 100 },
                {
                  id: "remove", header: "", width: 60,
                  cell: (r) => (
                    <Button variant="inline-link" onClick={() => removeRule(rules.indexOf(r))}>Remove</Button>
                  ),
                },
              ]}
            />
          </Container>
        )}
      </SpaceBetween>
    </Modal>
  );
}

function ruleDetail(rule: SopRule): string {
  switch (rule.kind) {
    case "threshold": return `value ${rule.value}`;
    case "policy": return `${rule.target} ${rule.operator} ${rule.value}`;
    case "naming": return `/${rule.pattern}/ on ${rule.appliesTo}`;
  }
}

const SAMPLE_YAML = `name: Production standards
description: Enforce minimum replicas and naming conventions
enabled: true
domainIds: []
rules:
  - kind: policy
    name: Min 2 replicas
    scope: index
    indexPattern: "prod-*"
    target: index.replicas
    operator: gte
    value: 2
    severity: high
    message: "Index {index} has fewer than 2 replicas"
  - kind: naming
    name: Daily index format
    pattern: "^logs-\\\\d{4}-\\\\d{2}-\\\\d{2}$"
    appliesTo: "logs-*"
    severity: medium
    message: "Index {index} does not follow logs-YYYY-MM-DD"`;
