# Installation Guide

Three ways to run OpenSearch Analyzer, from easiest to most customizable.

---

## Option 1: Docker (recommended)

**You need:** Docker Desktop installed and running.

```bash
# 1. Clone the repo
git clone https://github.com/patelbharav/opensearch-analyzer.git
cd opensearch-analyzer

# 2. Start everything
docker compose up -d

# 3. Install frontend dependencies and start the UI
npm install
npm run dev
```

**Open:** http://localhost:5173

**What's running:**

| Service | Port | Purpose |
|---|---|---|
| Web UI | 5173 | Browser interface |
| API | 3001 | Backend server |
| OpenSearch | 9200 | Local test cluster |
| LocalStack | 4566 | Local DynamoDB, S3, Secrets Manager |

**Connect your OpenSearch domain:**
1. Go to http://localhost:5173/domains
2. Click **Add domain**
3. Enter your domain endpoint, ARN, and region
4. Pick auth mode (SigV4 for most domains)
5. Click **Test connection** to verify
6. Click **Add domain** to save

---

## Option 2: Without Docker

**You need:** Node.js 20+ and an AWS account.

```bash
# 1. Clone and install
git clone https://github.com/patelbharav/opensearch-analyzer.git
cd opensearch-analyzer
npm install

# 2. Start Docker containers for state storage only
docker compose up -d localstack

# 3. Configure AWS credentials
#    Create a profile in ~/.aws/config:
#
#    [profile osa]
#    region = us-west-2
#    credential_process = <your credential command>
#
#    Examples:
#      credential_process = aws sso login --profile osa
#      credential_process = ada credentials print --account 123456789012 --role Admin

# 4. Start the app
AWS_PROFILE=osa AWS_REGION=us-west-2 AWS_LOCAL_ENDPOINT_URL=http://localhost:4566 npm run dev
```

**Open:** http://localhost:5173

---

## Option 3: Deploy to AWS (production)

**You need:** AWS CLI, Docker, Node.js 20+, CDK CLI.

```bash
# 1. Clone and install
git clone https://github.com/patelbharav/opensearch-analyzer.git
cd opensearch-analyzer/infra/cdk
npm install

# 2. Bootstrap CDK (one-time per account/region)
npx cdk bootstrap aws://ACCOUNT_ID/REGION

# 3. Deploy
npx cdk deploy
```

CDK creates everything: VPC, load balancer, ECS Fargate, DynamoDB, S3, Cognito.
Takes about 10 minutes. Cost: ~$80-120/month.

When it finishes, it prints:

```
Outputs:
  OpenSearchAnalyzerStack.AppUrl = http://OpenS-xxxx.elb.amazonaws.com
  OpenSearchAnalyzerStack.UserPoolId = us-east-1_AbCdEfGhI
```

**Create your first user:**

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId from output> \
  --username you@example.com \
  --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \
  --temporary-password 'TempPass123!'
```

Open the AppUrl, log in, and set a permanent password.

---

## After installation

### Step 1: Connect a domain

Go to **Domains** page and add your Amazon OpenSearch Service domain.

Your OpenSearch domain's access policy must allow the app's IAM role.
Add this to your domain's access policy:

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::YOUR_ACCOUNT:role/YOUR_ROLE" },
  "Action": "es:ESHttp*",
  "Resource": "arn:aws:es:REGION:ACCOUNT:domain/DOMAIN_NAME/*"
}
```

### Step 2: Run a scan

Go to **Findings** page, select your domain, click **Scan now**.
The app runs 14 diagnostics and shows any issues found.

### Step 3: Fix issues

Click a finding to see the detail panel. If a one-click fix is available,
click **Apply fix**, review the exact API call, and confirm.

### Step 4: Chat with the agent

Go to **Chat** page, select your domain, and describe your workload:

> "We ingest 500 GB of logs per day with hourly indices. Are our shards right-sized?"

The agent checks your cluster and gives specific recommendations.

### Step 5: Configure LLM (optional)

Go to **Settings** to switch the AI provider:

| Provider | What you need |
|---|---|
| Amazon Bedrock (default) | Nothing — uses your AWS credentials |
| Anthropic API | API key from console.anthropic.com |
| OpenAI | API key from platform.openai.com |
| Google Vertex AI | `gcloud auth application-default login` |

---

## Troubleshooting

**"Security token expired" on test connection**
Your AWS credentials expired. If using a profile with `credential_process`, restart the API.
If using env vars, refresh them and restart.

**"Domain not found" in chat**
LocalStack lost its data. Restart LocalStack (`docker compose up -d localstack`), restart the API, and re-add the domain.

**Chat gives an error about Bedrock model access**
Enable Anthropic model access in the Bedrock console for your region.
Go to: AWS Console > Bedrock > Model access > Request access for Anthropic models.

**Scan returns 0 findings**
Your cluster is healthy. To test the fix engine:
```bash
npx tsx apps/api/scripts/seed-test-data.ts <domainId>
```
This creates test indices with bad configurations. Clean up with:
```bash
npx tsx apps/api/scripts/cleanup-test-data.ts <domainId>
```

**Port already in use**
```bash
# Kill existing processes
pkill -f "tsx watch.*server.ts"   # API
pkill -f "vite.*opensearch"       # Web
```

---

## Uninstall

```bash
# Stop and remove containers + volumes
docker compose down -v

# Remove the repo
cd ..
rm -rf opensearch-analyzer

# If deployed to AWS
cd infra/cdk && npx cdk destroy
```
