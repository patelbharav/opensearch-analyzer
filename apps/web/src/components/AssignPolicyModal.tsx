import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
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
  const [allDomains, setAllDomains] = useState(ruleSet.domainIds.length === 0);

  useEffect(() => {
    setSelectedIds(ruleSet.domainIds);
    setAllDomains(ruleSet.domainIds.length === 0);
  }, [ruleSet]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateSopRuleSet(ruleSet.id, {
        ...ruleSet,
        domainIds: allDomains ? [] : selectedIds,
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
            >
              Save assignment
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box variant="p" color="text-body-secondary">
          Choose which domains this policy applies to. When "All domains" is checked, the policy is evaluated on every scan regardless of domain.
        </Box>

        {saveMutation.isError && (
          <Alert type="error">
            {saveMutation.error instanceof Error ? saveMutation.error.message : String(saveMutation.error)}
          </Alert>
        )}

        <Checkbox
          checked={allDomains}
          onChange={(e) => {
            setAllDomains(e.detail.checked);
            if (e.detail.checked) setSelectedIds([]);
          }}
        >
          <strong>All domains</strong> — applies to every connected domain
        </Checkbox>

        {!allDomains && (
          <SpaceBetween size="xs">
            {domains.length === 0 ? (
              <StatusIndicator type="warning">No domains connected yet.</StatusIndicator>
            ) : (
              domains.map((d) => (
                <Checkbox
                  key={d.id}
                  checked={selectedIds.includes(d.id)}
                  onChange={(e) => toggleDomain(d.id, e.detail.checked)}
                >
                  {d.name} <Box variant="small" display="inline" color="text-body-secondary">({d.region})</Box>
                </Checkbox>
              ))
            )}
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Modal>
  );
}
