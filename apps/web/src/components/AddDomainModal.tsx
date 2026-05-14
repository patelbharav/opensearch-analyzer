import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { api, type ConnectionTestResult } from "../api.js";
import type { CreateDomainRequest, DomainAuthMode } from "@osa/shared-types";

const AUTH_OPTIONS: SelectProps.Option[] = [
  { label: "SigV4 / IAM", value: "sigv4", description: "Use AWS credentials to sign requests" },
  { label: "Master user (basic auth)", value: "masterUser", description: "Username + password" },
  { label: "Cognito", value: "cognito", description: "Coming soon", disabled: true },
];

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onCreated: () => void;
}

export function AddDomainModal({ visible, onDismiss, onCreated }: Props) {
  const [name, setName] = useState("");
  const [arn, setArn] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [endpoint, setEndpoint] = useState("");
  const [authMode, setAuthMode] = useState<DomainAuthMode>("sigv4");
  const [assumedRoleArn, setAssumedRoleArn] = useState("");
  const [masterUsername, setMasterUsername] = useState("");
  const [masterPassword, setMasterPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName(""); setArn(""); setRegion("us-east-1"); setEndpoint("");
    setAuthMode("sigv4"); setAssumedRoleArn("");
    setMasterUsername(""); setMasterPassword("");
    setTestResult(null); setError(null);
  };

  const buildBody = (): CreateDomainRequest => ({
    name, arn, region, endpoint, authMode,
    assumedRoleArn: assumedRoleArn || undefined,
    masterUsername: masterUsername || undefined,
    masterPassword: masterPassword || undefined,
  });

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await api.testNewConnection(buildBody());
      setTestResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.createDomain(buildBody());
      reset();
      onCreated();
      onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const formValid =
    name && arn && region && endpoint &&
    (authMode !== "masterUser" || (masterUsername && masterPassword));

  const selectedAuthOption: SelectProps.Option =
    AUTH_OPTIONS.find((o) => o.value === authMode) ?? AUTH_OPTIONS[0]!;

  return (
    <Modal
      visible={visible}
      header="Add OpenSearch domain"
      onDismiss={() => { reset(); onDismiss(); }}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => { reset(); onDismiss(); }} variant="link">
              Cancel
            </Button>
            <Button onClick={handleTest} disabled={!formValid || testing} loading={testing}>
              Test connection
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!formValid || submitting}
              loading={submitting}
            >
              Add domain
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <Form>
        <SpaceBetween direction="vertical" size="m">
          {error && <Alert type="error">{error}</Alert>}
          {testResult?.ok && (
            <Alert type="success" header="Connection successful">
              Cluster <b>{testResult.clusterName}</b> · version {testResult.version} · status{" "}
              <b>{testResult.status}</b>
            </Alert>
          )}
          {testResult && !testResult.ok && (
            <Alert type="error" header="Connection failed">{testResult.error}</Alert>
          )}

          <FormField label="Display name">
            <Input value={name} onChange={(e) => setName(e.detail.value)} />
          </FormField>
          <FormField label="Domain ARN">
            <Input value={arn} onChange={(e) => setArn(e.detail.value)}
              placeholder="arn:aws:es:us-east-1:123456789012:domain/my-domain" />
          </FormField>
          <FormField label="AWS region">
            <Input value={region} onChange={(e) => setRegion(e.detail.value)} />
          </FormField>
          <FormField label="Endpoint" description="Hostname or full URL of the OpenSearch domain">
            <Input value={endpoint} onChange={(e) => setEndpoint(e.detail.value)}
              placeholder="search-my-domain-xxxxxxxx.us-east-1.es.amazonaws.com" />
          </FormField>
          <FormField label="Authentication">
            <Select
              selectedOption={selectedAuthOption}
              options={AUTH_OPTIONS}
              onChange={(e) =>
                setAuthMode((e.detail.selectedOption.value ?? "sigv4") as DomainAuthMode)
              }
            />
          </FormField>

          {authMode === "sigv4" && (
            <FormField
              label="Assumed role ARN (optional)"
              description="Cross-account role to assume before signing. Leave blank to use the API host's credentials."
            >
              <Input
                value={assumedRoleArn}
                onChange={(e) => setAssumedRoleArn(e.detail.value)}
                placeholder="arn:aws:iam::123456789012:role/OpenSearchAnalyzerReadOnly"
              />
            </FormField>
          )}

          {authMode === "masterUser" && (
            <>
              <FormField label="Master username">
                <Input value={masterUsername}
                  onChange={(e) => setMasterUsername(e.detail.value)} />
              </FormField>
              <FormField label="Master password" description="Stored in AWS Secrets Manager">
                <Input type="password" value={masterPassword}
                  onChange={(e) => setMasterPassword(e.detail.value)} />
              </FormField>
            </>
          )}
        </SpaceBetween>
      </Form>
    </Modal>
  );
}
