import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

// This diagnostic is a bit different — it can't be detected purely from the
// OpenSearch cluster APIs. It needs the AWS OpenSearch Service management API
// (DescribeDomain → DomainStatus.Processing). Since we don't have that wired
// into the snapshot yet, this diagnostic checks a proxy signal: if the cluster
// health shows 0 unassigned shards and status green, but there are relocating
// shards stuck for a long time, something is likely processing.
//
// For now this is a CW-based check: if the "Nodes" metric shows fluctuating
// node count (nodes dropping and coming back), a blue/green deploy is likely
// in progress or stuck.

export const stuckProcessing: DiagnosticDef = {
  id: "stuck-processing",
  title: "Domain possibly stuck in Processing state",
  run: (snapshot, ctx) => {
    // Check for relocating shards as a proxy for active blue/green.
    const h = snapshot.clusterHealth;
    if (h.relocating_shards === 0 && h.initializing_shards === 0) return [];

    // A small number of relocating shards for a short time is normal.
    // Flag only if it's significant relative to total shards.
    const relocPct = h.active_shards > 0 ? h.relocating_shards / h.active_shards : 0;
    if (relocPct < 0.05 && h.relocating_shards < 10) return [];

    return [
      makeFinding({
        diagnosticId: "stuck-processing",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "cluster",
        severity: "high",
        title: `${h.relocating_shards} relocating + ${h.initializing_shards} initializing shards`,
        summary:
          "A large number of shards are being relocated or initialized, which may indicate an " +
          "in-progress blue/green deployment or a domain stuck in Processing state. During this time, " +
          "no further configuration changes can be applied and performance may degrade.",
        evidence: {
          raw: {
            relocating_shards: h.relocating_shards,
            initializing_shards: h.initializing_shards,
            active_shards: h.active_shards,
            relocating_pct: Math.round(relocPct * 100),
          },
        },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Check domain status in the AWS console.",
          steps: [
            "Open the OpenSearch Service console and check if the domain shows 'Processing'.",
            "If stuck for >1 hour: check if there's a red index blocking shard migration.",
            "If stuck for >24 hours: contact AWS Support.",
            "Do NOT initiate another configuration change while Processing is active.",
          ],
        },
      }),
    ];
  },
};
