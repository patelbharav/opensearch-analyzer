# OpenSearch Analyzer — Architecture & Benefits

## One-liner

A self-hosted, AI-powered diagnostic tool that finds, explains, and fixes Amazon OpenSearch Service cluster problems — going beyond static rules by understanding your workload context.

---

## Problem Statement

| Pain point | Current state | What we solve |
|---|---|---|
| **Rule-based tools miss workload context** | Pulse/Cluster Insights apply same thresholds to everyone | AI agent asks about YOUR workload, then gives tailored advice |
| **Reactive troubleshooting** | Teams wait for pages/alerts, then scramble | Proactive scan catches issues before they become incidents |
| **No one-click remediation** | Engineers read docs, craft API calls manually | Fix button generates + executes the exact API call with audit trail |
| **No team-specific policies** | Best practices live in wikis nobody reads | SOPs encoded as rules, evaluated automatically on every scan |
| **Scattered tooling** | Console, CLI, dashboards, CloudWatch — context-switch hell | Single pane: metrics, diagnostics, chat, fixes |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          Browser (React + Cloudscape)                      │
│                                                                           │
│   Domains │ Overview │ Findings │ Chat │ Policies │ Settings │ Profile    │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │ HTTPS (JWT auth)
┌──────────────────────────────▼────────────────────────────────────────────┐
│                         Fastify API (Node 20)                              │
│                                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │  Domains    │  │  Scan Engine │  │  Fix Engine │  │  Chat Agent   │  │
│  │  (connect,  │  │  (22 built-in│  │  (execute,  │  │  (Vercel AI   │  │
│  │  auth,test) │  │  + SOP rules)│  │  audit,     │  │  SDK, tools,  │  │
│  │             │  │              │  │  rollback)  │  │  streaming)   │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └──────┬────────┘  │
│         │                │                  │                │           │
│  ┌──────▼──────────────────▼──────────────────▼──────────────▼────────┐  │
│  │              OpenSearch Target (auth-agnostic)                      │  │
│  │         SigV4/IAM  │  Master User  │  Assumed Role                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────┬──────────────┬──────────────┬──────────────┬──────────────────────┘
       │              │              │              │
  ┌────▼────┐   ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
  │Customer │   │CloudWatch │  │ DynamoDB  │  │ Bedrock / │
  │OpenSearch│   │(13 metrics│  │ + S3      │  │ Anthropic/│
  │ Domain  │   │ per scan) │  │ (state,   │  │ OpenAI /  │
  │         │   │           │  │  audit)   │  │ Vertex    │
  └─────────┘   └───────────┘  └───────────┘  └───────────┘
```

---

## Key Components

### 1. Diagnostic Engine (22 built-in + unlimited custom)

**How it works:** Collects a snapshot of the cluster via 9 API calls in parallel, then runs all diagnostics as pure functions against that snapshot.

| Data source | APIs called |
|---|---|
| Cluster health | `_cluster/health` |
| Node stats | `_nodes/stats` (jvm, os, process, fs, thread_pool, breaker) |
| Shard distribution | `_cat/shards`, `_cat/allocation` |
| Index metadata | `_cat/indices`, `_mapping`, `_settings` |
| ISM status | `_plugins/_ism/explain` |
| CloudWatch | 13 metrics via `GetMetricData` |

**22 built-in diagnostics:**

| Category | Diagnostics |
|---|---|
| Cluster | Red status, Yellow status, Stuck processing |
| JVM/Memory | JVM pressure, Circuit breaker trips |
| CPU | High CPU utilization |
| Shards | Too many shards, Oversized, Undersized, Node skew |
| Config | Misconfigured replicas, Unused indices, ISM missing/failed, Mapping explosion |
| Disk | Low storage, Low EBS burst balance |
| Errors | 5xx rate, Thread pool rejections, Search backpressure |
| Latency | Indexing latency, Search latency |
| Backup | Snapshot failures |

### 2. AI Chat Agent

**Architecture:** Tool-using agent via Vercel AI SDK — not RAG.

```
User: "We ingest 2TB/day of logs with daily indices"
  │
  ▼
Agent picks tools: getCatIndices → getNodesStats → getClusterHealth
  │
  ▼
Agent reasons over real data + user's workload context
  │
  ▼
Response: specific numbers, specific advice, points to Fix button
```

**Why tool-use beats RAG:** The model doesn't retrieve pre-written answers. It calls live APIs, sees your exact cluster state, does the math (e.g. 2TB ÷ 50GB = 40 shards needed), and gives advice no static doc could.

### 3. Fix Engine

```
Finding (with fix payload) → Confirmation modal → Execute → Audit log
```

- Every mutation requires explicit user confirmation
- Exact API call shown in the modal before execution
- Audit trail in S3 (who, when, what, response)
- Idempotency guard — can't re-apply the same fix twice
- Server-side refusal if `confirmationRequired` and no confirmation

### 4. SOP / Policy Engine

**Four rule types:**

| Type | Example | Evaluation |
|---|---|---|
| Threshold override | "JVM warn at 70% not 80%" | Modifies built-in diagnostic |
| Custom policy | "prod-* indices must have replicas >= 2" | Evaluated per-index/node/cluster |
| Naming convention | "logs-* must match `^logs-\d{4}-\d{2}-\d{2}$`" | Regex per-index |
| Natural language (prose) | "Small tenants should use shared indices" | AI evaluates paragraph vs snapshot |

**Assigned per-domain** — different teams can have different policies for different clusters.

### 5. Multi-Provider LLM

| Provider | Auth | Use case |
|---|---|---|
| Amazon Bedrock | IAM (auto) | Default — no extra keys |
| Anthropic API | API key | Direct access |
| OpenAI / Azure | API key + optional base URL | GPT-4o, Azure deployments |
| Google Vertex AI | gcloud ADC | Gemini, Claude on Vertex |

Switch providers in Settings — takes effect on the next chat message. No restart needed.

---

## Data Flow: Scan

```
1. User clicks "Scan now"
2. API loads domain config from DynamoDB
3. Builds OpenSearchTarget (auth-agnostic client)
4. Collects snapshot (9 OS API calls + 13 CW metrics) in parallel
5. Runs 22 built-in diagnostics (pure functions, <10ms)
6. Loads active SOP rule sets for this domain
7. Evaluates structured rules (sync)
8. Evaluates prose rules via LLM (async)
9. Persists findings + scan record to DynamoDB
10. Returns findings to UI
```

**Total scan time:** ~2-4 seconds (network-bound, not compute-bound).

---

## Security Model

| Layer | Implementation |
|---|---|
| App login | Local users (bcrypt + JWT) or Cognito |
| Domain auth | SigV4/IAM, master user, cross-account assumed role |
| API keys | Stored in AWS Secrets Manager, never returned to frontend |
| Fix safety | Mandatory confirmation modal, S3 audit log, idempotency guard |
| Embed security | CSP frame-ancestors allowlist, postMessage origin validation |
| Action history | Every scan, fix, login, config change recorded per user |

---

## Deployment Options

| Option | Complexity | Cost |
|---|---|---|
| `docker compose up` | Zero config | Free (local) |
| `npm run dev` | Node 20 required | Free (local) |
| `cdk deploy` | One command | ~$80-120/month (ECS Fargate + ALB) |

CDK stack includes: VPC, ECS Fargate, ALB, DynamoDB, S3, Cognito, IAM (least-privilege).

---

## Benefits Summary

### For SREs / Operators
- **Proactive issue detection** — catch problems before they page you
- **Workload-aware advice** — not generic rules, actual math based on your data
- **One-click fixes** — no more crafting API calls from docs
- **Full audit trail** — know who fixed what, when, and what the cluster looked like

### For Team Leads / Managers
- **Enforce best practices as code** — team SOPs evaluated automatically
- **Natural-language policies** — non-technical stakeholders can define rules in English
- **Consistent standards** — same rules evaluated on every scan, every time
- **Visibility** — action history shows who's doing what across clusters

### For the Organization
- **Reduce MTTR** — from "read docs → craft fix → test → apply" to "click Fix"
- **Prevent incidents** — proactive scanning catches issues in the warning zone
- **Knowledge capture** — best practices encoded in policies, not locked in heads
- **Multi-provider LLM** — no vendor lock-in, bring your own model
- **Self-hosted** — data never leaves your AWS account
- **Embeddable** — drop into the OpenSearch console or any internal portal

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + Cloudscape + Vite | AWS console visual parity |
| Backend | Node 20 + Fastify + TypeScript | Single language, streaming SSE |
| LLM | Vercel AI SDK | One interface, four providers |
| State | DynamoDB (single-table) | Serverless, auto-scaling |
| Audit | S3 (versioned, lifecycle) | Cheap, immutable, queryable |
| Auth | JWT + bcrypt (local) or Cognito | Simple to production-grade |
| Infra | CDK (TypeScript) | One-command deploy |
| Packaging | Docker multi-stage | Single image, <200MB |
| Testing | Vitest (29 diagnostic + 7 API tests) | Fast, fixture-based |

---

## What Makes This Different

| Feature | Pulse / Cluster Insights | OpenSearch Analyzer |
|---|---|---|
| Rule evaluation | Pre-built, static thresholds | 22 built-in + unlimited custom + AI prose |
| Workload context | None | AI asks about your workload first |
| Fix execution | Manual (docs + CLI) | One-click with audit trail |
| Team policies | Not supported | Full SOP engine (4 rule types) |
| Multi-domain | Per-domain only | Cross-account, cross-region |
| Chat interface | None | Streaming AI agent with live cluster access |
| Self-hosted | No (AWS-managed) | Yes — your VPC, your data |
| Embeddable | No | Yes — iframe + postMessage |
| LLM choice | None | Bedrock, Anthropic, OpenAI, Vertex |
