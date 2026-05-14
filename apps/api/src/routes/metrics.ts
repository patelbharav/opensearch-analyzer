import type { FastifyPluginAsync } from "fastify";
import { getDomain } from "../persistence/dynamo.js";
import { fetchMetrics, type WindowKey } from "../cloudwatch/metrics.js";

const VALID_WINDOWS = new Set<WindowKey>(["1h", "6h", "24h", "7d"]);

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:domainId", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    const { window: w } = (req.query ?? {}) as { window?: string };

    const domain = await getDomain(domainId);
    if (!domain) return reply.notFound(`Domain ${domainId} not found`);

    const window: WindowKey = VALID_WINDOWS.has(w as WindowKey)
      ? (w as WindowKey)
      : "24h";

    try {
      const metrics = await fetchMetrics({ domain, window });
      return { domainId, window, metrics };
    } catch (err) {
      return reply.code(502).send({
        error: "CloudWatch fetch failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
};
