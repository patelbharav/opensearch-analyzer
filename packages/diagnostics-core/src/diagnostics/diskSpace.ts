import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const HIGH_PCT = 80;
const CRITICAL_PCT = 90;

export const diskSpace: DiagnosticDef = {
  id: "disk-space",
  title: "Low free storage on data nodes",
  run: (snapshot, ctx) => {
    const offenders = snapshot.catAllocation
      .map((a) => ({
        node: a.node ?? "?",
        diskPct: parseInt(a["disk.percent"], 10),
        diskAvail: a["disk.avail"],
        diskTotal: a["disk.total"],
      }))
      .filter((x) => Number.isFinite(x.diskPct) && x.diskPct >= HIGH_PCT)
      .sort((a, b) => b.diskPct - a.diskPct);

    if (offenders.length === 0) return [];

    const max = offenders[0]!.diskPct;
    return [
      makeFinding({
        diagnosticId: "disk-space",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "disk",
        severity: max >= CRITICAL_PCT ? "critical" : "high",
        title: `${offenders.length} node(s) above ${HIGH_PCT}% disk usage (max ${max}%)`,
        summary:
          "OpenSearch blocks writes when nodes hit the high watermark (default 90%). At that point you'll see " +
          "ClusterBlockException on every index/update.",
        evidence: { raw: offenders },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Free space or scale storage.",
          steps: [
            "Delete or _close stale indices.",
            "Scale up EBS volume size (no downtime if using gp3).",
            "If write-blocked: PUT /_cluster/settings to clear cluster.blocks.read_only_allow_delete once usage is below low watermark.",
          ],
        },
      }),
    ];
  },
};
