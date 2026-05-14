import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import { api } from "../api.js";
import { AddDomainModal } from "../components/AddDomainModal.js";
import type { Domain } from "@osa/shared-types";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function authLabel(mode: Domain["authMode"]): string {
  return { sigv4: "SigV4 / IAM", masterUser: "Master user", cognito: "Cognito" }[mode];
}

export function DomainsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: () => api.listDomains(),
  });
  const domains = data?.domains ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDomain(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["domains"] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.testConnection(id),
    onSuccess: (result, id) => {
      const msg: FlashbarProps.MessageDefinition = {
        id: `test-${id}-${Date.now()}`,
        type: result.ok ? "success" : "error",
        dismissible: true,
        onDismiss: () => setFlash((prev) => prev.filter((m) => m.id !== msg.id)),
        content: result.ok
          ? `Connected — ${result.clusterName} (${result.version}, status: ${result.status})`
          : `Connection failed: ${result.error}`,
      };
      setFlash((prev) => [...prev, msg]);
    },
  });

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <Button variant="primary" iconName="add-plus" onClick={() => setModalOpen(true)}>
              Add domain
            </Button>
          }
        >
          Domains
        </Header>
      }
    >
      <SpaceBetween size="m">
        {/* Hero */}
        <div className="osa-hero">
          <h1>OpenSearch Analyzer</h1>
          <p>Connect your Amazon OpenSearch Service domains. Run diagnostics, apply fixes, and chat with an AI agent that understands your workload.</p>
        </div>

        {flash.length > 0 && <Flashbar items={flash} />}

        {isLoading && (
          <Box textAlign="center" padding="xxl">
            <StatusIndicator type="loading">Loading domains...</StatusIndicator>
          </Box>
        )}

        {!isLoading && domains.length === 0 && (
          <div className="osa-glass-card osa-fade-in" style={{ textAlign: "center", padding: "48px 24px" }}>
            <Box variant="h2" color="inherit">No domains connected</Box>
            <Box variant="p" color="text-body-secondary" margin={{ top: "xs", bottom: "m" }}>
              Add your first OpenSearch domain to start running diagnostics.
            </Box>
            <Button variant="primary" iconName="add-plus" onClick={() => setModalOpen(true)}>
              Add your first domain
            </Button>
          </div>
        )}

        {/* Domain cards grid */}
        {domains.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: 16,
          }}>
            {domains.map((d) => (
              <DomainCard
                key={d.id}
                domain={d}
                onTest={() => testMutation.mutate(d.id)}
                onDelete={() => deleteMutation.mutate(d.id)}
                onNavigate={() => navigate("/findings")}
                testing={testMutation.isPending}
              />
            ))}
          </div>
        )}

        <AddDomainModal
          visible={modalOpen}
          onDismiss={() => setModalOpen(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["domains"] })}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}

function DomainCard({
  domain,
  onTest,
  onDelete,
  onNavigate,
  testing,
}: {
  domain: Domain;
  onTest: () => void;
  onDelete: () => void;
  onNavigate: () => void;
  testing: boolean;
}) {
  return (
    <div className="osa-domain-card osa-fade-in">
      <div className="card-header" onClick={onNavigate} style={{ cursor: "pointer" }}>
        <h3>{domain.name}</h3>
        <div className="region">{domain.region}</div>
      </div>
      <div className="card-body">
        <div className="stat-row">
          <span className="stat-label">Auth</span>
          <Badge>{authLabel(domain.authMode)}</Badge>
        </div>
        <div className="stat-row">
          <span className="stat-label">Endpoint</span>
          <span style={{ fontSize: 11, color: "var(--osa-text-secondary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {domain.endpoint.replace(/^https?:\/\//, "")}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Last scan</span>
          {domain.lastScanAt ? (
            <StatusIndicator type="success">{relativeTime(domain.lastScanAt)}</StatusIndicator>
          ) : (
            <StatusIndicator type="pending">Never</StatusIndicator>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button onClick={onTest} loading={testing} variant="normal" iconName="status-positive">
            Test
          </Button>
          <Button onClick={onNavigate} variant="primary" iconName="search">
            Scan
          </Button>
          <Button onClick={onDelete} variant="link" iconName="remove">
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
