# CLAUDE.md

## Project: OpenSearch Analyzer

Self-hosted diagnostic tool for Amazon OpenSearch Service clusters.
Repo: https://github.com/patelbharav/opensearch-analyzer

## Current state (checkpoint: 2026-05-14)

### Completed milestones
- **M0** — Scaffolding (npm workspaces, Fastify, Vite+Cloudscape, Docker)
- **M1** — Connect domains (SigV4/IAM, master user, cross-account assumed role)
- **M2** — 14 built-in diagnostics with fixture tests
- **M3** — Fix engine (one-click apiCall fixes, S3 audit log, confirmation modal)
- **M4** — Cluster overview dashboard (13 CloudWatch metrics, line charts)
- **M5** — AI chat agent (Bedrock/Anthropic/OpenAI/Vertex via Vercel AI SDK)
- **M6** — Embed-ready packaging (CSP, postMessage handshake, embed-demo page)
- **M7** — CDK self-deploy stack (ECS Fargate + ALB + DDB + S3 + Cognito)
- **Settings** — Multi-provider LLM config (Bedrock, Anthropic, OpenAI, Vertex)
- **SOP engine** — Team-defined policies (threshold overrides, custom if-then rules, naming conventions, YAML import/export)
- **8 new diagnostics** — Thread pool rejections, mapping explosion, ISM health, snapshot failures, circuit breakers, EBS burst balance, search backpressure, stuck processing

### Total diagnostic catalog: 22
Built-in (14 original + 8 new) + unlimited custom SOP rules.

### Architecture
```
apps/api/          Fastify backend (Node 20, TypeScript)
apps/web/          React 18 + Cloudscape + Vite
packages/shared-types/     Finding, Fix, Domain, SopRuleSet types
packages/diagnostics-core/ Pure diagnostic functions + SOP evaluator
infra/cdk/         Optional CDK deploy stack
```

### Key files
- `apps/api/src/opensearch/target.ts` — auth abstraction (SigV4, master user)
- `apps/api/src/opensearch/collector.ts` — snapshot collector (5 OS APIs + thread pool + breaker + mapping + ISM)
- `apps/api/src/agent/llm.ts` — dynamic LLM provider factory
- `apps/api/src/agent/prompts.ts` — system prompt (brief, no emojis, actionable)
- `apps/api/src/fixes/engine.ts` — fix execution with idempotency guard + audit
- `apps/api/src/persistence/sop.ts` — SOP CRUD + YAML import/export
- `packages/diagnostics-core/src/sopEvaluator.ts` — SOP rule evaluation engine
- `apps/web/src/pages/Findings.tsx` — SplitPanel detail view with Apply Fix
- `apps/web/src/pages/Chat.tsx` — buffered rendering (waits for complete response)
- `apps/web/src/pages/Policies.tsx` — SOP rule set management UI

### Running locally
```bash
docker compose up -d localstack opensearch
AWS_PROFILE=osa-dev AWS_REGION=us-west-2 AWS_LOCAL_ENDPOINT_URL=http://localhost:4566 npm run dev
# web: http://localhost:5173  api: http://localhost:3001
```

### AWS profile
- `osa-dev` in ~/.aws/config — credential_process via ada, account 282384924069, auto-refreshing
- Connected domain: ma-solr-test-dev2 (us-west-2, SigV4)

### Tests
- 29 diagnostic fixture tests (packages/diagnostics-core)
- 7 API tests (health + fix engine)
- All passing as of this checkpoint

### Known issues to fix next
1. Page refresh requires re-testing connection before scan works
2. Sign-in button is non-functional (no auth implemented)
3. No user action history / audit trail per user profile
4. SOP policies lack natural-language / paragraph-style rule support

### Preferences (from user feedback)
- Commit every change immediately — never leave uncommitted work
- No emojis in LLM responses or UI
- Chat responses must be brief and actionable (8-10 lines max)
- Chat renders only after response is complete (no streaming jitter)
- AWS console look-and-feel (Cloudscape Design System)
