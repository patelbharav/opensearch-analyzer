import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

export const clusterYellow: DiagnosticDef = {
  id: "cluster-yellow",
  title: "Cluster status YELLOW",
  run: (snapshot, ctx) => {
    const h = snapshot.clusterHealth;
    if (h.status !== "yellow") return [];

    const singleNode = h.number_of_data_nodes <= 1;
    return [
      makeFinding({
        diagnosticId: "cluster-yellow",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "cluster",
        severity: "high",
        title: "Cluster status is YELLOW",
        summary: singleNode
          ? "Single-node cluster cannot allocate replicas. Add a data node or set replicas to 0."
          : `${h.unassigned_shards} replica shards are unassigned across ${h.number_of_data_nodes} data nodes.`,
        evidence: { raw: h },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: singleNode
            ? "Add a data node, or accept reduced fault tolerance."
            : "Identify under-replicated indices and either reduce replica count or scale the cluster.",
          steps: singleNode
            ? [
                "Add at least one more data node so replicas can be assigned.",
                "Or set replicas=0 on indices that don't need fault tolerance (dev/test workloads).",
              ]
            : [
                "GET /_cat/indices?v — find indices with health=yellow.",
                "Compare each index's number_of_replicas to (number_of_data_nodes - 1).",
                "If replicas exceed nodes-1, reduce replicas via PUT /<index>/_settings.",
                "Otherwise, add nodes or wait for in-progress allocation to complete.",
              ],
        },
      }),
    ];
  },
};
