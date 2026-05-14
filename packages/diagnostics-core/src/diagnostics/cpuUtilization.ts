import type { DiagnosticDef } from "../index.js";
import { makeFinding } from "../util.js";

const HIGH = 75;

export const cpuUtilization: DiagnosticDef = {
  id: "cpu-utilization",
  title: "High CPU utilization",
  run: (snapshot, ctx) => {
    const offenders = Object.values(snapshot.nodesStats.nodes)
      .map((n) => {
        const cpu = n.os?.cpu?.percent ?? n.process?.cpu?.percent;
        return cpu === undefined ? null : { node: n.name, roles: n.roles, cpu_percent: cpu };
      })
      .filter((x): x is { node: string; roles: string[]; cpu_percent: number } => !!x)
      .filter((x) => x.cpu_percent >= HIGH)
      .sort((a, b) => b.cpu_percent - a.cpu_percent);

    if (offenders.length === 0) return [];

    const max = offenders[0]!.cpu_percent;
    return [
      makeFinding({
        diagnosticId: "cpu-utilization",
        domainId: ctx.domainId,
        now: ctx.now,
        category: "cpu",
        severity: max >= 90 ? "critical" : "high",
        title: `${offenders.length} node(s) exceed ${HIGH}% CPU (max ${max}%)`,
        summary:
          `Per AWS Well-Architected (AOSPERF02-BP01), keep CPU below ${HIGH}%. Sustained high CPU causes ` +
          "queueing on search and write thread pools and 5xx spikes.",
        evidence: { metricName: "os.cpu.percent", value: max, threshold: HIGH, raw: offenders },
        fix: {
          kind: "guidance",
          confirmationRequired: false,
          description: "Reduce load or scale.",
          steps: [
            "GET /_nodes/hot_threads to find what's burning CPU.",
            "Inspect slow log for expensive queries (wildcards, deep aggregations).",
            "Scale to a larger instance type or add data nodes.",
          ],
        },
      }),
    ];
  },
};
