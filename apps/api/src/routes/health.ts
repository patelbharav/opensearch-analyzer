import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    service: "opensearch-analyzer-api",
    version: "0.1.0",
    time: new Date().toISOString(),
  }));
};
