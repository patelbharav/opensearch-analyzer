import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const MAX_SHARD_BYTES = 50 * 1024 * 1024 * 1024; // 50 GiB

export const oversizedShards: DiagnosticDef = {
  id: "oversized-shards",
  title: "Oversized shards (> 50 GiB)",
  run: (snapshot, ctx) => {
    type Offender = { index: string; primaryShards: number; primarySizeBytes: number; bytesPerShard: number };

    const offenders: Offender[] = [];
    for (const idx of snapshot.catIndices) {
      const pri = parseInt(idx.pri, 10);
      const primaryBytes = parseInt(idx["pri.store.size"], 10);
      if (!Number.isFinite(pri) || !Number.isFinite(primaryBytes) || pri === 0) continue;
      const perShard = primaryBytes / pri;
      if (perShard > MAX_SHARD_BYTES) {
        offenders.push({ index: idx.index, primaryShards: pri, primarySizeBytes: primaryBytes, bytesPerShard: perShard });
      }
    }

    if (offenders.length === 0) return [];

    return [
      makeFinding({
        diagnosticId: "oversized-shards",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "shard",
        severity: "high",
        title: `${offenders.length} index(es) have shards larger than 50 GiB`,
        summary:
          "Oversized shards make recovery slow and lead to uneven load. Target 10-30 GiB for search and 30-50 GiB " +
          "for log analytics workloads.",
        evidence: { raw: offenders.sort((a, b) => b.bytesPerShard - a.bytesPerShard).slice(0, 25) },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Resize via _split or rollover policy.",
          steps: [
            "For static indices: POST /<index>/_split/<target> with a higher number_of_shards.",
            "For time-series: configure an ISM rollover at a target primary size (e.g. min_primary_shard_size: 25gb).",
            "Reindex if you need a different shard count and cannot _split (e.g. shrink/split factor mismatch).",
          ],
        },
      }),
    ];
  },
};
