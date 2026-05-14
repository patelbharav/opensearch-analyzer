import { useEffect } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Finding, FixResult } from "@osa/shared-types";

interface Props {
  finding: Finding;
  visible: boolean;
  onDismiss: () => void;
  onApplied: (result: FixResult) => void;
}

export function ApplyFixModal({ finding, visible, onDismiss, onApplied }: Props) {
  const mutation = useMutation({
    mutationFn: () => api.applyFix(finding.id),
    onSuccess: (result) => onApplied(result),
  });

  // Auto-close after a successful apply so the user sees the green alert
  // briefly and the modal goes away. Stay open on failure so they can read
  // the error.
  useEffect(() => {
    if (mutation.data?.ok) {
      const t = setTimeout(() => {
        mutation.reset();
        onDismiss();
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [mutation.data?.ok, mutation, onDismiss]);

  const fix = finding.fix;
  if (!fix || fix.kind !== "apiCall") return null;
  const alreadyApplied = !!finding.appliedAt;

  return (
    <Modal
      visible={visible}
      header="Confirm fix application"
      onDismiss={() => { mutation.reset(); onDismiss(); }}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => { mutation.reset(); onDismiss(); }} variant="link">
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={mutation.isPending}
              disabled={alreadyApplied || !!mutation.data?.ok}
              onClick={() => mutation.mutate()}
            >
              {alreadyApplied || mutation.data?.ok ? "Applied" : "Apply fix"}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Alert type="warning" header="This will mutate cluster state">
          {fix.description} You can revert by manually re-issuing the previous setting.
        </Alert>

        <Box>
          <b>Finding:</b> {finding.title}
        </Box>

        <Box>
          <b>Request:</b>
          <Box variant="code">
            <pre style={{ margin: 0, fontSize: 12 }}>
              {fix.payload.method} {fix.payload.path}
              {fix.payload.body
                ? "\n\n" + JSON.stringify(fix.payload.body, null, 2)
                : ""}
            </pre>
          </Box>
        </Box>

        {mutation.isError && (
          <Alert type="error">
            {mutation.error instanceof Error
              ? mutation.error.message
              : String(mutation.error)}
          </Alert>
        )}

        {mutation.data && !mutation.data.ok && (
          <Alert type="error" header={`Apply failed (${mutation.data.statusCode ?? "n/a"})`}>
            {mutation.data.error}
            {mutation.data.response ? (
              <Box variant="code">
                <pre style={{ margin: 0, fontSize: 11 }}>
                  {JSON.stringify(mutation.data.response, null, 2)}
                </pre>
              </Box>
            ) : null}
          </Alert>
        )}
        {mutation.data?.ok && (
          <Alert type="success" header="Fix applied">
            Audit log: <code>{mutation.data.auditKey}</code>
          </Alert>
        )}
      </SpaceBetween>
    </Modal>
  );
}
