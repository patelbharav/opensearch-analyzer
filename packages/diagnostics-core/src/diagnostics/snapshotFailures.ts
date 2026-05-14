import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

export const snapshotFailures: DiagnosticDef = {
  id: "snapshot-failures",
  title: "Automated snapshot failures",
  run: (snapshot, ctx) => {
    const m = snapshot.metrics;
    if (!m || m.automatedSnapshotFailure.length === 0) return [];

    const failures = m.automatedSnapshotFailure.filter((p) => p.value >= 1);
    if (failures.length === 0) return [];

    return [
      makeFinding({
        diagnosticId: "snapshot-failures",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "config",
        severity: "high",
        title: `${failures.length} automated snapshot failure(s) in the last ${m.window}`,
        summary:
          "Automated snapshots are failing. If this continues for 14 days, the oldest healthy snapshot " +
          "will age out and you risk permanent data loss on a red-cluster event. Most common cause: " +
          "red cluster status or insufficient permissions on the snapshot S3 bucket.",
        evidence: { raw: { failureCount: failures.length, window: m.window } },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Restore snapshot health.",
          steps: [
            "Check cluster health — snapshots fail when any index is RED.",
            "GET /_snapshot/cs-automated/_all to see recent snapshot status and error details.",
            "Verify the snapshot S3 bucket exists and the service-linked role has write access.",
            "If red cluster: resolve the red status first (see cluster-red diagnostic).",
          ],
        },
      }),
    ];
  },
};
