import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const MIN_SHARD_BYTES = 1 * 1024 * 1024 * 1024; // 1 GiB
const MIN_DOC_COUNT = 1_000;
const MIN_INDICES_TO_REPORT = 5;

export const undersizedShards: DiagnosticDef = {
  id: "undersized-shards",
  title: "Many tiny shards (< 1 GiB)",
  run: (snapshot, ctx) => {
    type Offender = { index: string; primaryShards: number; bytesPerShard: number; docs: number };

    const offenders: Offender[] = [];
    for (const idx of snapshot.catIndices) {
      const pri = parseInt(idx.pri, 10);
      const primaryBytes = parseInt(idx["pri.store.size"], 10);
      const docs = parseInt(idx["docs.count"], 10);
      if (!Number.isFinite(pri) || !Number.isFinite(primaryBytes) || pri === 0) continue;
      if (docs < MIN_DOC_COUNT) continue; // ignore empty/system indices
      const perShard = primaryBytes / pri;
      if (perShard < MIN_SHARD_BYTES) {
        offenders.push({ index: idx.index, primaryShards: pri, bytesPerShard: perShard, docs });
      }
    }

    if (offenders.length < MIN_INDICES_TO_REPORT) return [];

    return [
      makeFinding({
        diagnosticId: "undersized-shards",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "shard",
        severity: "medium",
        title: `${offenders.length} index(es) have shards smaller than 1 GiB`,
        summary:
          "Many tiny shards waste cluster state, JVM heap, and CPU on every query (each shard is searched separately). " +
          "Each shard costs roughly 1KB of cluster state plus memory for segments.",
        evidence: { raw: offenders.sort((a, b) => a.bytesPerShard - b.bytesPerShard).slice(0, 25) },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Shrink, reindex, or use ISM rollover with a primary-size threshold.",
          steps: [
            "For static indices: POST /<index>/_shrink/<target> to reduce primary shard count.",
            "For time-series: switch from time-bucket rotation (daily/hourly) to size-bucket rotation (rollover at e.g. 25 GiB).",
          ],
        },
      }),
    ];
  },
};
