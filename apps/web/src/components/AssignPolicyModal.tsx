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

  useEffect(() => {
    setSelectedIds(ruleSet.domainIds);
  }, [ruleSet]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateSopRuleSet(ruleSet.id, {
        ...ruleSet,
        domainIds: selectedIds,
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
  };

  const selectAll = () => setSelectedIds(domains.map((d) => d.id));
  const clearAll = () => setSelectedIds([]);

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
              disabled={selectedIds.length === 0}
            >
              {selectedIds.length === 0
                ? "Select at least one domain"
                : `Apply to ${selectedIds.length} domain${selectedIds.length > 1 ? "s" : ""}`}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {/* Current assignment */}
        <Box>
          <Box variant="awsui-key-label">Currently applied to</Box>
          {assignedDomainNames.length > 0 ? (
            <SpaceBetween direction="horizontal" size="xs">
              {assignedDomainNames.map((name) => (
                <Badge key={name}>{name}</Badge>
              ))}
            </SpaceBetween>
          ) : (
            <Box color="text-body-secondary">Not applied to any domain yet</Box>
          )}
        </Box>

        <hr style={{ border: "none", borderTop: "1px solid var(--osa-border, #e5e7eb)", margin: "4px 0" }} />

        {saveMutation.isError && (
          <Alert type="error">
            {saveMutation.error instanceof Error ? saveMutation.error.message : String(saveMutation.error)}
          </Alert>
        )}

        <Box>
          <Box variant="awsui-key-label">Select domains to apply this policy</Box>
          <Box variant="small" color="text-body-secondary" margin={{ bottom: "xs" }}>
            The policy will only be evaluated during scans for the selected domains.
          </Box>
        </Box>

        <SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={selectAll}>Select all</Button>
          <Button variant="link" onClick={clearAll}>Clear all</Button>
        </SpaceBetween>

        {domains.length === 0 ? (
          <StatusIndicator type="warning">No domains connected. Add a domain first.</StatusIndicator>
        ) : (
          <SpaceBetween size="xs">
            {domains.map((d) => (
              <Checkbox
                key={d.id}
                checked={selectedIds.includes(d.id)}
                onChange={(e) => toggleDomain(d.id, e.detail.checked)}
              >
                <strong>{d.name}</strong>
                <Box variant="small" display="inline" color="text-body-secondary">
                  {" "} — {d.region} ({d.authMode === "sigv4" ? "SigV4/IAM" : d.authMode})
                </Box>
              </Checkbox>
            ))}
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Modal>
  );
}
