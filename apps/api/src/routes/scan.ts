import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { ScanResult } from "@osa/shared-types";
import { runAllDiagnostics, evaluateSopRuleSet } from "@osa/diagnostics-core";
import { getDomain } from "../persistence/dynamo.js";
import { getActiveSopRuleSets } from "../persistence/sop.js";
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

    const builtInFindings = runAllDiagnostics(snapshot, { domainId, now: startedAt });

    // Evaluate SOP rule sets against the same snapshot.
    let sopFindings: import("@osa/shared-types").Finding[] = [];
    try {
      const activeRuleSets = await getActiveSopRuleSets(domainId);
      sopFindings = activeRuleSets.flatMap((rs) =>
        evaluateSopRuleSet(snapshot, rs, { domainId, now: startedAt }),
      );
    } catch (err) {
      req.log.warn({ err }, "SOP evaluation failed — skipping");
    }

    const findings = [...builtInFindings, ...sopFindings];

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
