import type { FastifyPluginAsync } from "fastify";
import type { AppSettings, UpdateSettingsRequest } from "@osa/shared-types";
import {
  getSettings,
  getLlmApiKey,
  putSettings,
  sanitizeForFrontend,
  storeLlmApiKey,
} from "../persistence/settings.js";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const settings = await getSettings();
    const hasKey = !!(await getLlmApiKey());
    const safe = sanitizeForFrontend(settings);
    // Override apiKeySet based on actual Secrets Manager state.
    if (safe.llm.provider === "anthropic" || safe.llm.provider === "openai") {
      (safe.llm as { apiKeySet: boolean }).apiKeySet = hasKey;
    }
    return safe;
  });

  app.put<{ Body: UpdateSettingsRequest }>("/", async (req) => {
    const { llm } = req.body;
    const { apiKey, ...llmConfig } = llm as UpdateSettingsRequest["llm"];

    // Persist the API key separately in Secrets Manager.
    if (apiKey && apiKey.trim().length > 0) {
      await storeLlmApiKey(apiKey.trim());
    }

    const settings: AppSettings = {
      llm: llmConfig,
      updatedAt: new Date().toISOString(),
    };
    await putSettings(settings);

    const hasKey = !!(await getLlmApiKey());
    const safe = sanitizeForFrontend(settings);
    if (safe.llm.provider === "anthropic" || safe.llm.provider === "openai") {
      (safe.llm as { apiKeySet: boolean }).apiKeySet = hasKey;
    }
    return safe;
  });
};
