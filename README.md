# OpenSearch Analyzer

A self-hosted diagnostic tool for Amazon OpenSearch Service. Finds common cluster problems (shard skew, JVM pressure, misconfigured replicas, high CPU, disk pressure, 5xx errors, slow queries), explains them in plain language, and offers one-click fixes.

Includes an AI chat agent (powered by Amazon Bedrock, Anthropic, OpenAI, or Google Vertex) that understands your workload context and gives tailored recommendations — not generic rules.

Built with the [Cloudscape Design System](https://cloudscape.design) for visual parity with the AWS console.

## Features

- **14 built-in diagnostics** covering every alarm in the [AWS recommended CloudWatch alarms guide](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/cloudwatch-alarms.html)
- **One-click fixes** with mandatory confirmation modal, rollback guidance, and S3 audit log
- **AI workload chat** — describe your use case ("we ingest 2 TB/day of logs with daily indices"), get specific shard-sizing and scaling advice
- **Cluster overview dashboard** — real-time CloudWatch charts (JVM, CPU, 5xx, latency, disk)
- **Multi-provider LLM** — bring your own model from Bedrock, Anthropic, OpenAI, or Vertex AI
- **3 auth modes** for connecting OpenSearch domains: SigV4/IAM, master user, or assumed cross-account role
- **Embed-ready** — runs inside an iframe with postMessage domain handshake (for console integration)
- **CDK stack** — optional one-command deploy to your AWS account (ECS Fargate + ALB + DynamoDB + S3 + Cognito)

## Quick start (Docker)

The fastest way to run the app locally:

```bash
git clone https://github.com/<your-org>/opensearch-analyzer.git
cd opensearch-analyzer
docker compose up -d
```

This starts:
- **OpenSearch** (single node) on `localhost:9200`
- **LocalStack** (DynamoDB, S3, Secrets Manager) on `localhost:4566`
- **Analyzer API** on `localhost:3001`

Then open the web UI:

```bash
npm install
npm run dev
# open http://localhost:5173
```

## Quick start (without Docker)

Prerequisites: Node.js 20+, an AWS account with an OpenSearch domain.

```bash
git clone https://github.com/<your-org>/opensearch-analyzer.git
cd opensearch-analyzer
npm install
```

Create an AWS profile for the account that owns your OpenSearch domain:

```bash
# ~/.aws/config
[profile osa]
region = us-west-2
credential_process = ada credentials print --account <ACCOUNT_ID> --role Admin
```

Start the API:

```bash
AWS_PROFILE=osa \
AWS_REGION=us-west-2 \
AWS_LOCAL_ENDPOINT_URL=http://localhost:4566 \
npm run dev
```

Open http://localhost:5173, click **Add domain**, and enter your OpenSearch endpoint.

## Architecture

```
Browser (React + Cloudscape)
  |
  | HTTPS
  v
Fastify API (Node 20)
  ├── /api/domains        — connect OpenSearch domains (SigV4, master user, cross-account)
  ├── /api/scan/:id       — run 14 diagnostics, persist findings
  ├── /api/findings       — list findings with fix payloads
  ├── /api/fix/:id        — execute a fix (with confirmation + S3 audit)
  ├── /api/chat           — streaming AI agent (SSE)
  ├── /api/metrics/:id    — CloudWatch time series
  └── /api/settings       — LLM provider configuration
        |           |           |           |
   OpenSearch    CloudWatch   DynamoDB    Bedrock /
   (customer)    (metrics)    + S3        Anthropic /
                              (state)     OpenAI /
                                          Vertex
```

## Project structure

```
opensearch-analyzer/
├── apps/
│   ├── api/                   Fastify backend
│   │   └── src/
│   │       ├── routes/        API endpoints
│   │       ├── opensearch/    Client, auth, snapshot collector
│   │       ├── diagnostics/   (imports from diagnostics-core)
│   │       ├── fixes/         Fix execution engine + audit
│   │       ├── agent/         LLM tools, prompts, provider factory
│   │       ├── cloudwatch/    Metrics fetcher
│   │       └── persistence/   DynamoDB, S3, Secrets Manager, settings
│   └── web/                   React + Cloudscape frontend
│       └── src/
│           ├── pages/         Domains, Findings, Overview, Chat, Settings
│           └── components/    AddDomainModal, ApplyFixModal, Markdown
├── packages/
│   ├── shared-types/          TypeScript interfaces (Finding, Fix, Domain, etc.)
│   └── diagnostics-core/      Pure diagnostic functions (fixture-testable)
├── infra/cdk/                 Optional CDK deploy stack
├── Dockerfile                 Multi-stage build
└── docker-compose.yml         Local dev (OpenSearch + LocalStack)
```

## Diagnostics catalog

| # | Diagnostic | Severity | Fix type |
|---|---|---|---|
| 1 | Cluster status RED | critical | guidance |
| 2 | Cluster status YELLOW | high | guidance |
| 3 | High JVM memory pressure (>80%) | high/critical | guidance |
| 4 | High CPU utilization (>75%) | high/critical | guidance |
| 5 | Too many shards (>30k) | high | guidance |
| 6 | Oversized shards (>50 GiB) | high | guidance |
| 7 | Undersized shards (<1 GiB, 5+ indices) | medium | guidance |
| 8 | Node shard skew (>15% CV) | medium | guidance |
| 9 | Misconfigured replicas (0 or > nodes-1) | high/medium | **one-click** |
| 10 | Stale indices (>30 days old) | low | guidance |
| 11 | Low disk space (>80%) | high/critical | guidance |
| 12 | 5xx error rate (>10%) | high/critical | guidance |
| 13 | High indexing latency (>1s avg) | high/critical | guidance |
| 14 | Slow search responses (>500ms avg) | high/critical | guidance |

## LLM providers

Configure in **Settings** (http://localhost:5173/settings):

| Provider | Auth | Models |
|---|---|---|
| Amazon Bedrock | IAM credentials (auto) | Claude Sonnet 4.6, Haiku 4.5, etc. |
| Anthropic API | API key (stored in Secrets Manager) | Claude Sonnet 4.6, Haiku 4.5, etc. |
| OpenAI / Azure | API key + optional base URL | GPT-4o, o3, o4-mini |
| Google Vertex AI | gcloud ADC | Claude on Vertex, Gemini 2.5 |

## Deploy to AWS (CDK)

One-command deploy into your own account:

```bash
cd infra/cdk
npm install
npx cdk bootstrap aws://<ACCOUNT>/<REGION>
npx cdk deploy
```

Creates: VPC, ECS Fargate (1 vCPU, 2 GiB), ALB, DynamoDB, S3 audit bucket, Cognito user pool. Estimated cost: ~$80-120/month.

See [infra/cdk/README.md](infra/cdk/README.md) for full deploy instructions, first-time login, and domain connection setup.

## Embed in another app

The UI supports iframe embedding with a postMessage handshake:

```html
<iframe src="https://your-analyzer.example.com/?embed=1"></iframe>
```

The parent page can push a domain context:

```js
iframe.contentWindow.postMessage(
  { type: 'osa.select-domain', arn: 'arn:aws:es:...' },
  'https://your-analyzer.example.com'
);
```

Demo: http://localhost:3001/embed-demo

## Development

```bash
npm install                      # install all workspaces
npm run dev                      # start API (3001) + web (5173)
npm run typecheck                # typecheck all 4 workspaces
npm test                         # run all tests (18 diagnostic + 7 API)
docker compose up -d             # local OpenSearch + LocalStack
```

### Running tests

```bash
npm --workspace @osa/diagnostics-core test   # 18 fixture-based diagnostic tests
npm --workspace @osa/api test                # 7 API tests (health + fix engine)
```

### Test the fix engine

Create deliberately broken indices to exercise the Apply Fix flow:

```bash
npx tsx apps/api/scripts/seed-test-data.ts <domainId>
# Then: Findings page → Scan now → expand finding → Apply fix

# Clean up:
npx tsx apps/api/scripts/cleanup-test-data.ts <domainId>
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AWS_PROFILE` | — | AWS profile for OpenSearch + Bedrock credentials |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_LOCAL_ENDPOINT_URL` | — | LocalStack endpoint (dev only) |
| `DYNAMO_TABLE_NAME` | `opensearch-analyzer` | DynamoDB table name |
| `AUDIT_BUCKET` | `opensearch-analyzer-audit` | S3 bucket for fix audit log |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-sonnet-4-6` | Default Bedrock model |
| `EMBED_ALLOWED_ORIGINS` | AWS console + localhost | Comma-separated origins for CSP frame-ancestors |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `PORT` | `3001` | API port |
| `LOG_LEVEL` | `info` | Pino log level |

## License

Apache 2.0
