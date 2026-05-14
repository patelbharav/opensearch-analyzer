import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const FIELD_RATIO_WARN = 0.8; // warn at 80% of the limit

export const mappingExplosion: DiagnosticDef = {
  id: "mapping-explosion",
  title: "Mapping field count near limit",
  run: (snapshot, ctx) => {
    const counts = snapshot.indexFieldCounts;
    if (!counts || counts.length === 0) return [];

    const offenders = counts
      .filter((c) => c.fieldCount >= c.fieldLimit * FIELD_RATIO_WARN)
      .sort((a, b) => b.fieldCount / b.fieldLimit - a.fieldCount / a.fieldLimit);

    if (offenders.length === 0) return [];

    const exceeded = offenders.filter((c) => c.fieldCount >= c.fieldLimit);
    const severity = exceeded.length > 0 ? "critical" : "high";

    return [
      makeFinding({
        diagnosticId: "mapping-explosion",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "config",
        severity,
        title: `${offenders.length} index(es) near or over the field mapping limit`,
        summary:
          exceeded.length > 0
            ? `${exceeded.length} index(es) have hit the field limit — new documents with unknown fields will be rejected. ` +
              "Common cause: dynamic mapping on unstructured JSON (e.g. user-submitted data, log metadata with arbitrary keys)."
            : `${offenders.length} index(es) are above 80% of the field limit. They'll start rejecting documents soon.`,
        evidence: { raw: offenders.slice(0, 20) },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Control field growth.",
          steps: [
            "Set dynamic: 'strict' or dynamic: false on indices that shouldn't accept arbitrary fields.",
            "Increase the limit if the fields are legitimate: PUT /<index>/_settings { index.mapping.total_fields.limit: 2000 }.",
            "Use flattened field type for high-cardinality nested objects.",
            "Reindex to a new mapping that consolidates or drops unnecessary fields.",
          ],
        },
      }),
    ];
  },
};
