import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function DomainsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: () => api.listDomains(),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Domain[]>([]);
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDomain(id),
    onSuccess: () => {
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ["domains"] });
    },
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
          ? `Connection ok — cluster ${result.clusterName} (status: ${result.status})`
          : `Connection failed: ${result.error}`,
      };
      setFlash((prev) => [...prev, msg]);
    },
    onError: (err) => {
      const msg: FlashbarProps.MessageDefinition = {
        id: `test-err-${Date.now()}`,
        type: "error",
        dismissible: true,
        onDismiss: () => setFlash((prev) => prev.filter((m) => m.id !== msg.id)),
        content: err instanceof Error ? err.message : String(err),
      };
      setFlash((prev) => [...prev, msg]);
    },
  });

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Connect an Amazon OpenSearch Service domain to start diagnosing it."
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                disabled={selected.length !== 1}
                onClick={() => selected[0] && testMutation.mutate(selected[0].id)}
                loading={testMutation.isPending}
              >
                Test connection
              </Button>
              <Button
                disabled={selected.length !== 1}
                onClick={() => selected[0] && deleteMutation.mutate(selected[0].id)}
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
              <Button variant="primary" onClick={() => setModalOpen(true)}>
                Add domain
              </Button>
            </SpaceBetween>
          }
        >
          Domains
        </Header>
      }
    >
      <SpaceBetween size="m">
        {flash.length > 0 && <Flashbar items={flash} />}
        <Table
          loading={isLoading}
          selectionType="single"
          selectedItems={selected}
          onSelectionChange={(e) => setSelected([...e.detail.selectedItems])}
          items={data?.domains ?? []}
          trackBy="id"
          columnDefinitions={[
            {
              id: "name",
              header: "Name",
              cell: (d) => (
                <Link
                  onFollow={(e) => {
                    e.preventDefault();
                    navigate("/findings");
                  }}
                  href="/findings"
                >
                  {d.name}
                </Link>
              ),
              sortingField: "name",
              isRowHeader: true,
            },
            { id: "region", header: "Region", cell: (d) => d.region, width: 120 },
            {
              id: "auth",
              header: "Auth",
              cell: (d) => <Badge>{authLabel(d.authMode)}</Badge>,
              width: 140,
            },
            {
              id: "endpoint",
              header: "Endpoint",
              cell: (d) => (
                <Box variant="small" color="text-body-secondary">
                  {d.endpoint.replace(/^https?:\/\//, "")}
                </Box>
              ),
            },
            {
              id: "lastScan",
              header: "Last scan",
              cell: (d) =>
                d.lastScanAt ? (
                  <StatusIndicator type="success">
                    {relativeTime(d.lastScanAt)}
                  </StatusIndicator>
                ) : (
                  <StatusIndicator type="pending">Never</StatusIndicator>
                ),
              width: 140,
            },
          ]}
          empty={
            <Box textAlign="center" color="inherit" padding={{ vertical: "xxl" }}>
              <SpaceBetween size="m">
                <Box variant="h2" color="inherit">No domains connected</Box>
                <Box variant="p" color="text-body-secondary">
                  Connect an Amazon OpenSearch Service domain to start running diagnostics.
                </Box>
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  Add your first domain
                </Button>
              </SpaceBetween>
            </Box>
          }
          header={<Header counter={`(${data?.domains.length ?? 0})`}>Connected domains</Header>}
        />
      </SpaceBetween>

      <AddDomainModal
        visible={modalOpen}
        onDismiss={() => setModalOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["domains"] })}
      />
    </ContentLayout>
  );
}

function authLabel(mode: Domain["authMode"]): string {
  switch (mode) {
    case "sigv4":      return "SigV4 / IAM";
    case "masterUser": return "Master user";
    case "cognito":    return "Cognito";
  }
}

