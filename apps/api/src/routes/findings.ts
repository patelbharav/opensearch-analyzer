import type { FastifyPluginAsync } from "fastify";
import { listFindingsByDomain } from "../persistence/dynamo.js";

export const findingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const { domainId } = req.query as { domainId?: string };
    if (!domainId) return { findings: [] };
    const findings = await listFindingsByDomain(domainId);
    return { findings };
  });
};
