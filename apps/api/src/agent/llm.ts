import type { LanguageModel } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createVertex } from "@ai-sdk/google-vertex";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { LlmConfig } from "@osa/shared-types";
import { getSettings, getLlmApiKey } from "../persistence/settings.js";

/**
 * Builds a LanguageModel from the persisted LLM settings.
 * Called per-chat-request so a settings change takes effect immediately.
 */
export async function getModel(): Promise<LanguageModel> {
  const settings = await getSettings();
  const config = settings.llm;

  switch (config.provider) {
    case "bedrock":
      return buildBedrockModel(config);
    case "anthropic":
      return buildAnthropicModel(config);
    case "openai":
      return buildOpenAIModel(config);
    case "vertex":
      return buildVertexModel(config);
    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown LLM provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

async function buildBedrockModel(config: { region: string; modelId: string }) {
  const credentialProvider = fromNodeProviderChain();
  const creds = await credentialProvider();
  const bedrock = createAmazonBedrock({
    region: config.region,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  });
  return bedrock(config.modelId);
}

async function buildAnthropicModel(config: { modelId: string }) {
  const apiKey = await getLlmApiKey();
  if (!apiKey) {
    throw new Error(
      "Anthropic API key not configured. Go to Settings and enter your API key.",
    );
  }
  const anthropic = createAnthropic({ apiKey });
  return anthropic(config.modelId);
}

async function buildOpenAIModel(config: { modelId: string; baseUrl?: string }) {
  const apiKey = await getLlmApiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Go to Settings and enter your API key.",
    );
  }
  const openai = createOpenAI({
    apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });
  return openai(config.modelId);
}

function buildVertexModel(config: {
  project: string;
  location: string;
  modelId: string;
}) {
  const vertex = createVertex({
    project: config.project,
    location: config.location,
  });
  return vertex(config.modelId);
}
