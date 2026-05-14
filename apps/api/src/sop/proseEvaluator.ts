import { generateText } from "ai";
import type { Finding, ProseRule, SopRuleSet } from "@osa/shared-types";
import type { ClusterSnapshot } from "@osa/diagnostics-core";
import { getModel } from "../agent/llm.js";
import { makeFinding } from "@osa/diagnostics-core";

/**
 * Evaluate prose (natural-language) SOP rules by asking the LLM to check the
 * cluster snapshot against each rule's description. Returns findings for any
 * violations the LLM identifies.
 */
export async function evaluateProseRules(
  snapshot: ClusterSnapshot,
  ruleSet: SopRuleSet,
  ctx: { domainId: string; now: Date },
): Promise<Finding[]> {
  const proseRules = ruleSet.rules.filter(
    (r): r is ProseRule => r.kind === "prose",
  );
  if (proseRules.length === 0) return [];

  const snapshotSummary = buildSnapshotSummary(snapshot);
  const model = await getModel();

  const findings: Finding[] = [];

  for (const rule of proseRules) {
    try {
      const result = await generateText({
        model,
        system: `You are an OpenSearch cluster auditor. You will be given:
1. A cluster snapshot summary (JSON).
2. A team policy rule written in natural language.

Your job: check whether the cluster violates the policy.

If there is a violation, respond with EXACTLY this JSON format (no markdown, no explanation outside the JSON):
{"violated": true, "title": "<short title>", "summary": "<1-2 sentence explanation with specific numbers>"}

If there is NO violation, respond with:
{"violated": false}

Respond with ONLY the JSON object. No other text.`,
        prompt: `Cluster snapshot summary:
${snapshotSummary}

Team policy rule: "${rule.name}"
${rule.description}`,
        maxOutputTokens: 300,
      });

      const text = result.text.trim();
      let parsed: { violated: boolean; title?: string; summary?: string };
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch?.[0] ?? text);
      } catch {
        continue;
      }

      if (parsed.violated && parsed.title && parsed.summary) {
        findings.push(
          makeFinding({
            diagnosticId: `sop:${ruleSet.id}:prose:${rule.name}`,
            domainId: ctx.domainId,
            now: ctx.now,
            category: "config",
            severity: rule.severity,
            title: parsed.title,
            summary: parsed.summary,
            evidence: { raw: { rule: rule.name, ruleDescription: rule.description } },
          }),
        );
      }
    } catch (err) {
      console.warn(`[prose-eval] Failed to evaluate rule "${rule.name}":`, err);
    }
  }

  return findings;
}

function buildSnapshotSummary(snapshot: ClusterSnapshot): string {
  const h = snapshot.clusterHealth;
  const nodes = Object.values(snapshot.nodesStats.nodes);

  const indices = snapshot.catIndices
    .filter((i) => !i.index.startsWith("."))
    .map((i) => ({
      index: i.index,
      health: i.health,
      primaryShards: parseInt(i.pri, 10),
      replicas: parseInt(i.rep, 10),
      docs: parseInt(i["docs.count"], 10),
      storeSizeBytes: parseInt(i["store.size"], 10),
      primaryStoreSizeBytes: parseInt(i["pri.store.size"], 10),
    }))
    .slice(0, 50);

  return JSON.stringify(
    {
      clusterStatus: h.status,
      nodes: h.number_of_nodes,
      dataNodes: h.number_of_data_nodes,
      activeShards: h.active_shards,
      unassignedShards: h.unassigned_shards,
      nodeStats: nodes.map((n) => ({
        name: n.name,
        heapUsedPercent: n.jvm?.mem.heap_used_percent,
        cpuPercent: n.os?.cpu?.percent,
        diskAvailableBytes: n.fs?.total.available_in_bytes,
        diskTotalBytes: n.fs?.total.total_in_bytes,
      })),
      indices,
    },
    null,
    2,
  );
}
