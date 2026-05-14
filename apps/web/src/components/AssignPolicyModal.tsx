import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Checkbox from "@cloudscape-design/components/checkbox";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { api } from "../api.js";
import type { SopRuleSet } from "@osa/shared-types";

interface Props {
  ruleSet: SopRuleSet;
  visible: boolean;
  onDismiss: () => void;
}

export function AssignPolicyModal({ ruleSet, visible, onDismiss }: Props) {
  const qc = useQueryClient();
  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => api.listDomains(),
  });
  const domains = domainsQuery.data?.domains ?? [];

  const [selectedIds, setSelectedIds] = useState<string[]>(ruleSet.domainIds);
  const [applyToAll, setApplyToAll] = useState(false);

  useEffect(() => {
    setSelectedIds(ruleSet.domainIds);
    // Only show "All domains" as checked if it was explicitly saved that way
    // (domainIds empty AND policy has been updated at least once).
    setApplyToAll(ruleSet.domainIds.length === 0 && !!ruleSet.updatedAt && ruleSet.updatedAt !== ruleSet.createdAt);
  }, [ruleSet]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateSopRuleSet(ruleSet.id, {
        ...ruleSet,
        domainIds: applyToAll ? [] : selectedIds,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sop"] });
      onDismiss();
    },
  });

  const toggleDomain = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((d) => d !== id),
    );
    if (checked) setApplyToAll(false);
  };

  // Current assignment summary
  const currentAssignment = ruleSet.domainIds.length === 0
    ? "Currently applies to: All domains"
    : `Currently applies to: ${ruleSet.domainIds.length} domain(s)`;
  const assignedDomainNames = ruleSet.domainIds
    .map((id) => domains.find((d) => d.id === id)?.name)
    .filter(Boolean);

  return (
    <Modal
      visible={visible}
      header={`Apply "${ruleSet.name}" to domains`}
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onDismiss} variant="link">Cancel</Button>
            <Button
              variant="primary"
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={!applyToAll && selectedIds.length === 0}
            >
              {!applyToAll && selectedIds.length === 0
                ? "Select at least one domain"
                : "Save assignment"}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {/* Current assignment */}
        <Box>
          <Box variant="awsui-key-label">Current assignment</Box>
          <SpaceBetween direction="horizontal" size="xs">
            {ruleSet.domainIds.length === 0 ? (
              <Badge color="blue">All domains</Badge>
            ) : assignedDomainNames.length > 0 ? (
              assignedDomainNames.map((name) => (
                <Badge key={name}>{name}</Badge>
              ))
            ) : (
              <Box color="text-body-secondary">Not assigned to any domain</Box>
            )}
          </SpaceBetween>
        </Box>

        <hr style={{ border: "none", borderTop: "1px solid var(--osa-border, #e5e7eb)", margin: "4px 0" }} />

        {saveMutation.isError && (
          <Alert type="error">
            {saveMutation.error instanceof Error ? saveMutation.error.message : String(saveMutation.error)}
          </Alert>
        )}

        <Box variant="awsui-key-label">New assignment</Box>

        <Checkbox
          checked={applyToAll}
          onChange={(e) => {
            setApplyToAll(e.detail.checked);
            if (e.detail.checked) setSelectedIds([]);
          }}
        >
          <strong>All domains</strong> — evaluate on every scan regardless of domain
        </Checkbox>

        {!applyToAll && (
          <>
            <Box variant="awsui-key-label" margin={{ top: "s" }}>
              Select specific domains
            </Box>
            <SpaceBetween size="xs">
              {domains.length === 0 ? (
                <StatusIndicator type="warning">No domains connected yet. Add a domain first.</StatusIndicator>
              ) : (
                domains.map((d) => (
                  <Checkbox
                    key={d.id}
                    checked={selectedIds.includes(d.id)}
                    onChange={(e) => toggleDomain(d.id, e.detail.checked)}
                  >
                    <strong>{d.name}</strong>
                    <Box variant="small" display="inline" color="text-body-secondary"> — {d.region} ({d.authMode})</Box>
                  </Checkbox>
                ))
              )}
            </SpaceBetween>
          </>
        )}
      </SpaceBetween>
    </Modal>
  );
}
