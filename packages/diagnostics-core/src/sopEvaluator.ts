import type {
  CustomPolicy,
  Finding,
  NamingConvention,
  SopRule,
  SopRuleSet,
  ThresholdOverride,
} from "@osa/shared-types";
import type { ClusterSnapshot } from "./snapshot.js";
import { makeFinding } from "./util.js";

export interface SopEvalContext {
  domainId: string;
  now: Date;
}

export function evaluateSopRuleSet(
  snapshot: ClusterSnapshot,
  ruleSet: SopRuleSet,
  ctx: SopEvalContext,
): Finding[] {
  if (!ruleSet.enabled) return [];
  return ruleSet.rules.flatMap((rule) => evaluateRule(snapshot, rule, ruleSet, ctx));
}

function evaluateRule(
  snapshot: ClusterSnapshot,
  rule: SopRule,
  ruleSet: SopRuleSet,
  ctx: SopEvalContext,
): Finding[] {
  switch (rule.kind) {
    case "threshold":
      return evaluateThreshold(snapshot, rule, ruleSet, ctx);
    case "policy":
      return evaluatePolicy(snapshot, rule, ruleSet, ctx);
    case "naming":
      return evaluateNaming(snapshot, rule, ruleSet, ctx);
  }
}

// ---- Threshold overrides ----

function evaluateThreshold(
  _snapshot: ClusterSnapshot,
  _rule: ThresholdOverride,
  _ruleSet: SopRuleSet,
  _ctx: SopEvalContext,
): Finding[] {
  // Threshold overrides are consumed by the built-in diagnostics at scan time
  // (the scan endpoint injects them). They don't produce separate findings.
  return [];
}

// ---- Custom policies ----

function evaluatePolicy(
  snapshot: ClusterSnapshot,
  rule: CustomPolicy,
  ruleSet: SopRuleSet,
  ctx: SopEvalContext,
): Finding[] {
  switch (rule.scope) {
    case "index":
      return evaluateIndexPolicy(snapshot, rule, ruleSet, ctx);
    case "node":
      return evaluateNodePolicy(snapshot, rule, ruleSet, ctx);
    case "cluster":
      return evaluateClusterPolicy(snapshot, rule, ruleSet, ctx);
  }
}

function evaluateIndexPolicy(
  snapshot: ClusterSnapshot,
  rule: CustomPolicy,
  ruleSet: SopRuleSet,
  ctx: SopEvalContext,
): Finding[] {
  const findings: Finding[] = [];
  const pattern = rule.indexPattern ? globToRegex(rule.indexPattern) : null;

  for (const idx of snapshot.catIndices) {
    if (idx.index.startsWith(".")) continue;
    if (pattern && !pattern.test(idx.index)) continue;

    const actual = resolveIndexTarget(snapshot, idx, rule.target, ctx);
    if (actual === undefined) continue;

    if (!compare(actual, rule.operator, rule.value)) {
      findings.push(
        makeFinding({
          diagnosticId: `sop:${ruleSet.id}:${rule.name}`,
          domainId: ctx.domainId,
          now: ctx.now,
          category: "config",
          severity: rule.severity,
          title: `Policy violation: ${rule.name} on index ${idx.index}`,
          summary: rule.message.replace("{index}", idx.index).replace("{value}", String(actual)),
          evidence: { raw: { index: idx.index, target: rule.target, actual, expected: `${rule.operator} ${rule.value}` } },
          fix: rule.fixSteps
            ? { kind: "guidance", confirmationRequired: false, description: rule.message, steps: rule.fixSteps }
            : undefined,
        }),
      );
    }
  }
  return findings;
}

function evaluateNodePolicy(
  snapshot: ClusterSnapshot,
  rule: CustomPolicy,
  ruleSet: SopRuleSet,
  ctx: SopEvalContext,
): Finding[] {
  const findings: Finding[] = [];
  for (const [_nodeId, node] of Object.entries(snapshot.nodesStats.nodes)) {
    const actual = resolveNodeTarget(node, rule.target);
    if (actual === undefined) continue;
    if (!compare(actual, rule.operator, rule.value)) {
      findings.push(
        makeFinding({
          diagnosticId: `sop:${ruleSet.id}:${rule.name}`,
          domainId: ctx.domainId,
          now: ctx.now,
          category: "config",
          severity: rule.severity,
          title: `Policy violation: ${rule.name} on node ${node.name}`,
          summary: rule.message.replace("{node}", node.name).replace("{value}", String(actual)),
          evidence: { raw: { node: node.name, target: rule.target, actual, expected: `${rule.operator} ${rule.value}` } },
          fix: rule.fixSteps
            ? { kind: "guidance", confirmationRequired: false, description: rule.message, steps: rule.fixSteps }
            : undefined,
        }),
      );
    }
  }
  return findings;
}

function evaluateClusterPolicy(
  snapshot: ClusterSnapshot,
  rule: CustomPolicy,
  ruleSet: SopRuleSet,
  ctx: SopEvalContext,
): Finding[] {
  const actual = resolveClusterTarget(snapshot, rule.target);
  if (actual === undefined) return [];
  if (!compare(actual, rule.operator, rule.value)) {
    return [
      makeFinding({
        diagnosticId: `sop:${ruleSet.id}:${rule.name}`,
        domainId: ctx.domainId,
        now: ctx.now,
        category: "config",
        severity: rule.severity,
        title: `Policy violation: ${rule.name}`,
        summary: rule.message.replace("{value}", String(actual)),
        evidence: { raw: { target: rule.target, actual, expected: `${rule.operator} ${rule.value}` } },
        fix: rule.fixSteps
          ? { kind: "guidance", confirmationRequired: false, description: rule.message, steps: rule.fixSteps }
          : undefined,
      }),
    ];
  }
  return [];
}

// ---- Naming conventions ----

function evaluateNaming(
  snapshot: ClusterSnapshot,
  rule: NamingConvention,
  ruleSet: SopRuleSet,
  ctx: SopEvalContext,
): Finding[] {
  const findings: Finding[] = [];
  const appliesTo = globToRegex(rule.appliesTo);
  let regex: RegExp;
  try {
    regex = new RegExp(rule.pattern);
  } catch {
    return [];
  }

  for (const idx of snapshot.catIndices) {
    if (idx.index.startsWith(".")) continue;
    if (!appliesTo.test(idx.index)) continue;
    if (!regex.test(idx.index)) {
      findings.push(
        makeFinding({
          diagnosticId: `sop:${ruleSet.id}:${rule.name}`,
          domainId: ctx.domainId,
          now: ctx.now,
          category: "config",
          severity: rule.severity,
          title: `Naming violation: ${rule.name} on index ${idx.index}`,
          summary: rule.message.replace("{index}", idx.index),
          evidence: { raw: { index: idx.index, pattern: rule.pattern, matched: false } },
        }),
      );
    }
  }
  return findings;
}

// ---- Target resolvers ----

import type { CatIndex, NodeStat } from "./snapshot.js";

function resolveIndexTarget(
  snapshot: ClusterSnapshot,
  idx: CatIndex,
  target: string,
  ctx: SopEvalContext,
): string | number | boolean | undefined {
  switch (target) {
    case "index.replicas": return parseInt(idx.rep, 10);
    case "index.primaryShards": return parseInt(idx.pri, 10);
    case "index.storeSizeBytes": return parseInt(idx["store.size"], 10);
    case "index.shardSizeBytes": {
      const pri = parseInt(idx.pri, 10);
      const size = parseInt(idx["pri.store.size"], 10);
      return pri > 0 ? Math.round(size / pri) : undefined;
    }
    case "index.ageInDays": {
      const created = idx["creation.date"] ? parseInt(idx["creation.date"], 10) : NaN;
      return Number.isFinite(created)
        ? Math.floor((ctx.now.getTime() - created) / 86_400_000)
        : undefined;
    }
    case "index.name": return idx.index;
    case "index.fieldCount": {
      const fc = snapshot.indexFieldCounts?.find((f) => f.index === idx.index);
      return fc?.fieldCount;
    }
    case "index.hasIsmPolicy": {
      const ism = snapshot.ismStatuses?.find((s) => s.index === idx.index);
      return ism ? !!ism.policyId : undefined;
    }
    default: return undefined;
  }
}

function resolveNodeTarget(node: NodeStat, target: string): number | undefined {
  switch (target) {
    case "node.heapUsedPercent": return node.jvm?.mem.heap_used_percent;
    case "node.cpuPercent": return node.os?.cpu?.percent ?? node.process?.cpu?.percent;
    case "node.diskPercent": {
      const fs = node.fs?.total;
      if (!fs || fs.total_in_bytes === 0) return undefined;
      return Math.round(((fs.total_in_bytes - fs.available_in_bytes) / fs.total_in_bytes) * 100);
    }
    default: return undefined;
  }
}

function resolveClusterTarget(snapshot: ClusterSnapshot, target: string): number | undefined {
  switch (target) {
    case "cluster.dataNodeCount": return snapshot.clusterHealth.number_of_data_nodes;
    case "cluster.totalShards": return snapshot.clusterHealth.active_shards;
    default: return undefined;
  }
}

// ---- Comparison engine ----

function compare(
  actual: string | number | boolean,
  operator: string,
  expected: string | number | boolean,
): boolean {
  switch (operator) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "gt": return Number(actual) > Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "contains": return String(actual).includes(String(expected));
    case "not_contains": return !String(actual).includes(String(expected));
    case "matches": {
      try { return new RegExp(String(expected)).test(String(actual)); }
      catch { return false; }
    }
    default: return true;
  }
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
