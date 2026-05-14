import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const STALE_AGE_DAYS = 30;
const MIN_INDICES_TO_REPORT = 3;

export const unusedIndices: DiagnosticDef = {
  id: "unused-indices",
  title: "Stale indices (older than 30d, no recent ingest)",
  run: (snapshot, ctx) => {
    type Offender = { index: string; ageDays: number; docs: number; sizeBytes: number };
    const offenders: Offender[] = [];

    for (const idx of snapshot.catIndices) {
      if (idx.index.startsWith(".")) continue;
      const created = idx["creation.date"] ? parseInt(idx["creation.date"], 10) : NaN;
      if (!Number.isFinite(created)) continue;
      const ageMs = ctx.now.getTime() - created;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < STALE_AGE_DAYS) continue;
      const docs = parseInt(idx["docs.count"], 10);
      const sizeBytes = parseInt(idx["store.size"], 10);
      offenders.push({ index: idx.index, ageDays: Math.round(ageDays), docs, sizeBytes });
    }

    if (offenders.length < MIN_INDICES_TO_REPORT) return [];

    return [
      makeFinding({
        diagnosticId: "unused-indices",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "config",
        severity: "low",
        title: `${offenders.length} index(es) older than ${STALE_AGE_DAYS} days`,
        summary:
          "Stale indices still consume disk and JVM heap (cluster state, segment metadata) even when not queried. " +
          "Without slow-log/audit-log access we can't tell if they're queried — deletion needs human judgement.",
        evidence: { raw: offenders.sort((a, b) => b.ageDays - a.ageDays).slice(0, 25) },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Confirm and delete or close stale indices.",
          steps: [
            "Cross-check against your application's retention policy.",
            "POST /<index>/_close to keep on disk but remove from memory.",
            "DELETE /<index> to free disk entirely (irreversible — confirm snapshot exists first).",
            "Configure an ISM delete-by-age policy to automate this going forward.",
          ],
        },
      }),
    ];
  },
};
