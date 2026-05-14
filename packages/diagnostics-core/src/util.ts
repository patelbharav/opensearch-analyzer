import type { Finding } from "@osa/shared-types";

let counter = 0;

export function newFindingId(diagnosticId: string, ctx: { now: Date }): string {
  counter += 1;
  return `${diagnosticId}-${ctx.now.getTime()}-${counter}`;
}

export interface MakeFindingArgs {
  diagnosticId: string;
  domainId: string;
  now: Date;
  category: Finding["category"];
  severity: Finding["severity"];
  title: string;
  summary: string;
  evidence: Finding["evidence"];
  fix?: Finding["fix"];
}

export function makeFinding(args: MakeFindingArgs): Finding {
  return {
    id: newFindingId(args.diagnosticId, { now: args.now }),
    domainId: args.domainId,
    diagnosticId: args.diagnosticId,
    category: args.category,
    severity: args.severity,
    title: args.title,
    summary: args.summary,
    evidence: args.evidence,
    fix: args.fix,
    createdAt: args.now.toISOString(),
  };
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}
