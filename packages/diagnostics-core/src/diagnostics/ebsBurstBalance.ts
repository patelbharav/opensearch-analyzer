import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const CRITICAL_PCT = 20;
const WARN_PCT = 70;

export const ebsBurstBalance: DiagnosticDef = {
  id: "ebs-burst-balance",
  title: "Low EBS burst balance",
  run: (snapshot, ctx) => {
    const m = snapshot.metrics;
    if (!m || m.burstBalance.length === 0) return [];

    const minBalance = Math.min(...m.burstBalance.map((p) => p.value));
    // Burst balance stays at 0 for gp3 and gp2 > 1 TiB — skip those.
    if (minBalance === 0 && m.burstBalance.every((p) => p.value === 0)) return [];
    if (minBalance >= WARN_PCT) return [];

    return [
      makeFinding({
        diagnosticId: "ebs-burst-balance",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "disk",
        severity: minBalance < CRITICAL_PCT ? "critical" : "high",
        title: `EBS burst balance dropped to ${Math.round(minBalance)}%`,
        summary:
          "General Purpose SSD (gp2) volumes have a burst credit system. When the balance hits 0, " +
          "IOPS drop to the baseline (3 IOPS/GiB) and search/indexing latency spikes dramatically. " +
          "The balance stays at 0 for gp3 volumes (they don't burst) — if you see 0 on gp3, ignore this.",
        evidence: {
          metricName: "BurstBalance",
          value: minBalance,
          threshold: WARN_PCT,
          raw: { minBalance, window: m.window },
        },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Switch volume type or reduce IOPS demand.",
          steps: [
            "Upgrade from gp2 to gp3 — gp3 provides consistent IOPS without burst credits.",
            "If already on gp3, increase provisioned IOPS in the domain configuration.",
            "Reduce write throughput (lower bulk rate, increase refresh_interval).",
            "Scale EBS volume size — larger gp2 volumes have higher baseline IOPS.",
          ],
        },
      }),
    ];
  },
};
