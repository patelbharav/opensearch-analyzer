import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { ScanResult } from "@osa/shared-types";
import { runAllDiagnostics } from "@osa/diagnostics-core";
import { getDomain } from "../persistence/dynamo.js";
import {
  putFindings,
  putScan,
  updateDomainLastScanAt,
} from "../persistence/dynamo.js";
import { collectSnapshot } from "../opensearch/collector.js";
import { buildTarget } from "../opensearch/target.js";

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.post("/:domainId", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    const domain = await getDomain(domainId);
    if (!domain) return reply.notFound(`Domain ${domainId} not found`);

    const startedAt = new Date();
    const scanId = randomUUID();

    let target;
    try {
      target = await buildTarget({ domain });
    } catch (err) {
      return reply.code(502).send({
        error: "Failed to build OpenSearch target",
        message: err instanceof Error ? err.message : String(err),
      });
    }

    let snapshot;
    try {
      snapshot = await collectSnapshot(target, { metricsWindow: "24h" });
    } catch (err) {
      const meta = (err as { meta?: { statusCode?: number; body?: unknown } }).meta;
      return reply.code(502).send({
        error: "Failed to collect cluster snapshot",
        message: err instanceof Error ? err.message : String(err),
        statusCode: meta?.statusCode,
        body: meta?.body,
      });
    }

    const findings = runAllDiagnostics(snapshot, { domainId, now: startedAt });

    const completedAt = new Date();
    const result: ScanResult = {
      scanId,
      domainId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      findings,
    };

    await Promise.all([
      putFindings(findings),
      putScan(result),
      updateDomainLastScanAt(domainId, completedAt.toISOString()),
    ]);

    return result;
  });
};
