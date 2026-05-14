import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Cards from "@cloudscape-design/components/cards";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Tiles from "@cloudscape-design/components/tiles";
import { api } from "../api.js";
import type { LlmProvider, UpdateSettingsRequest } from "@osa/shared-types";

const PROVIDERS: {
  value: LlmProvider;
  label: string;
  description: string;
}[] = [
  {
    value: "bedrock",
    label: "Amazon Bedrock",
    description: "Use Claude, Llama, Mistral models via your AWS account. No API key needed — uses IAM credentials.",
  },
  {
    value: "anthropic",
    label: "Anthropic API",
    description: "Direct Anthropic API access. Requires an API key from console.anthropic.com.",
  },
  {
    value: "openai",
    label: "OpenAI / Azure OpenAI",
    description: "GPT-4o, GPT-4 Turbo, or Azure-deployed models. Requires an API key.",
  },
  {
    value: "vertex",
    label: "Google Vertex AI",
    description: "Claude on Vertex, Gemini, PaLM. Uses Google Cloud ADC — no API key, needs gcloud auth.",
  },
];

const BEDROCK_MODELS: SelectProps.Option[] = [
  { label: "Claude Sonnet 4.6 (US)", value: "us.anthropic.claude-sonnet-4-6" },
  { label: "Claude Sonnet 4 (US)", value: "us.anthropic.claude-sonnet-4-20250514-v1:0" },
  { label: "Claude Haiku 4.5 (US)", value: "us.anthropic.claude-haiku-4-5-20251001-v1:0" },
  { label: "Claude 3.5 Haiku (US)", value: "us.anthropic.claude-3-5-haiku-20241022-v1:0" },
  { label: "Claude 3 Sonnet (US)", value: "us.anthropic.claude-3-sonnet-20240229-v1:0" },
];

const ANTHROPIC_MODELS: SelectProps.Option[] = [
  { label: "Claude Sonnet 4.6", value: "claude-sonnet-4-6-20250514" },
  { label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514" },
  { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
  { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-20241022" },
];

const OPENAI_MODELS: SelectProps.Option[] = [
  { label: "GPT-4o", value: "gpt-4o" },
  { label: "GPT-4o Mini", value: "gpt-4o-mini" },
  { label: "GPT-4 Turbo", value: "gpt-4-turbo" },
  { label: "o3", value: "o3" },
  { label: "o4-mini", value: "o4-mini" },
];

const VERTEX_MODELS: SelectProps.Option[] = [
  { label: "Claude Sonnet 4.6", value: "claude-sonnet-4-6@20250514" },
  { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
  { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
];

const REGIONS: SelectProps.Option[] = [
  { label: "US West 2 (Oregon)", value: "us-west-2" },
  { label: "US East 1 (N. Virginia)", value: "us-east-1" },
  { label: "EU West 1 (Ireland)", value: "eu-west-1" },
  { label: "AP Northeast 1 (Tokyo)", value: "ap-northeast-1" },
];

export function SettingsPage() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });

  const [provider, setProvider] = useState<LlmProvider>("bedrock");
  const [modelId, setModelId] = useState("us.anthropic.claude-sonnet-4-6");
  const [region, setRegion] = useState("us-west-2");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [vertexProject, setVertexProject] = useState("");
  const [vertexLocation, setVertexLocation] = useState("us-central1");
  const [apiKeySet, setApiKeySet] = useState(false);

  // Hydrate form from server settings.
  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setProvider(s.llm.provider);
    setModelId(s.llm.modelId);
    if (s.llm.provider === "bedrock") setRegion(s.llm.region);
    if (s.llm.provider === "openai") setBaseUrl((s.llm as { baseUrl?: string }).baseUrl ?? "");
    if (s.llm.provider === "vertex") {
      setVertexProject((s.llm as { project?: string }).project ?? "");
      setVertexLocation((s.llm as { location?: string }).location ?? "us-central1");
    }
    if (s.llm.provider === "anthropic" || s.llm.provider === "openai") {
      setApiKeySet((s.llm as { apiKeySet?: boolean }).apiKeySet ?? false);
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (body: UpdateSettingsRequest) => api.updateSettings(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
      setApiKey(""); // clear raw key from form after save
    },
  });

  const handleSave = () => {
    let llm: UpdateSettingsRequest["llm"];
    switch (provider) {
      case "bedrock":
        llm = { provider: "bedrock", region, modelId } as UpdateSettingsRequest["llm"];
        break;
      case "anthropic":
        llm = {
          provider: "anthropic", modelId, apiKeySet: false,
          apiKey: apiKey || undefined,
        } as UpdateSettingsRequest["llm"];
        break;
      case "openai":
        llm = {
          provider: "openai", modelId, apiKeySet: false,
          baseUrl: baseUrl || undefined,
          apiKey: apiKey || undefined,
        } as UpdateSettingsRequest["llm"];
        break;
      case "vertex":
        llm = {
          provider: "vertex", project: vertexProject,
          location: vertexLocation, modelId,
        } as UpdateSettingsRequest["llm"];
        break;
    }
    saveMutation.mutate({ llm });
  };

  const modelsForProvider = (): SelectProps.Option[] => {
    switch (provider) {
      case "bedrock": return BEDROCK_MODELS;
      case "anthropic": return ANTHROPIC_MODELS;
      case "openai": return OPENAI_MODELS;
      case "vertex": return VERTEX_MODELS;
    }
  };

  const selectedModelOption = modelsForProvider().find((m) => m.value === modelId) ?? {
    label: modelId,
    value: modelId,
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Configure the LLM provider the chat agent uses. Changes take effect on the next message."
        >
          Settings
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">LLM provider</Header>}>
          <SpaceBetween size="l">
            <Tiles
              value={provider}
              onChange={(e) => {
                const p = e.detail.value as LlmProvider;
                setProvider(p);
                // Reset model to first option for the new provider.
                const opts = {
                  bedrock: BEDROCK_MODELS,
                  anthropic: ANTHROPIC_MODELS,
                  openai: OPENAI_MODELS,
                  vertex: VERTEX_MODELS,
                };
                setModelId(opts[p][0]!.value!);
              }}
              items={PROVIDERS.map((p) => ({
                value: p.value,
                label: p.label,
                description: p.description,
              }))}
              columns={2}
            />
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Model configuration</Header>}>
          <SpaceBetween size="m">
            <ColumnLayout columns={2}>
              <FormField label="Model">
                <Select
                  selectedOption={selectedModelOption}
                  options={modelsForProvider()}
                  onChange={(e) => setModelId(e.detail.selectedOption.value ?? modelId)}
                />
              </FormField>

              {provider === "bedrock" && (
                <FormField label="AWS region" description="Where Bedrock is invoked.">
                  <Select
                    selectedOption={REGIONS.find((r) => r.value === region) ?? REGIONS[0]!}
                    options={REGIONS}
                    onChange={(e) => setRegion(e.detail.selectedOption.value ?? region)}
                  />
                </FormField>
              )}

              {(provider === "anthropic" || provider === "openai") && (
                <FormField
                  label="API key"
                  description={
                    apiKeySet
                      ? "A key is already saved. Enter a new one to replace it, or leave blank to keep existing."
                      : "Required. Stored encrypted in AWS Secrets Manager."
                  }
                  secondaryControl={
                    apiKeySet ? (
                      <StatusIndicator type="success">Key saved</StatusIndicator>
                    ) : (
                      <StatusIndicator type="warning">Not set</StatusIndicator>
                    )
                  }
                >
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.detail.value)}
                    placeholder={apiKeySet ? "••••••••••••••••" : "sk-..."}
                  />
                </FormField>
              )}

              {provider === "openai" && (
                <FormField
                  label="Base URL (optional)"
                  description="For Azure OpenAI or compatible APIs. Leave blank for openai.com."
                >
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.detail.value)}
                    placeholder="https://my-deployment.openai.azure.com/v1"
                  />
                </FormField>
              )}

              {provider === "vertex" && (
                <>
                  <FormField label="GCP project ID">
                    <Input
                      value={vertexProject}
                      onChange={(e) => setVertexProject(e.detail.value)}
                      placeholder="my-gcp-project-123"
                    />
                  </FormField>
                  <FormField label="Location">
                    <Input
                      value={vertexLocation}
                      onChange={(e) => setVertexLocation(e.detail.value)}
                      placeholder="us-central1"
                    />
                  </FormField>
                </>
              )}
            </ColumnLayout>

            {saveMutation.isError && (
              <Alert type="error">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : String(saveMutation.error)}
              </Alert>
            )}
            {saveMutation.isSuccess && (
              <Alert type="success" dismissible onDismiss={() => saveMutation.reset()}>
                Settings saved. The chat agent will use the new provider on the next message.
              </Alert>
            )}

            <Box float="right">
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saveMutation.isPending}
              >
                Save settings
              </Button>
            </Box>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Current configuration</Header>}>
          {settingsQuery.data ? (
            <Cards
              cardDefinition={{
                header: () => "Active LLM",
                sections: [
                  { id: "provider", header: "Provider", content: () => settingsQuery.data!.llm.provider },
                  { id: "model", header: "Model", content: () => settingsQuery.data!.llm.modelId },
                  {
                    id: "updated",
                    header: "Last updated",
                    content: () =>
                      settingsQuery.data!.updatedAt
                        ? new Date(settingsQuery.data!.updatedAt).toLocaleString()
                        : "Default (never changed)",
                  },
                ],
              }}
              items={[settingsQuery.data]}
              loading={settingsQuery.isLoading}
            />
          ) : (
            <StatusIndicator type="loading">Loading...</StatusIndicator>
          )}
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
