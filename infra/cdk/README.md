# OpenSearch Analyzer — Self-deploy CDK stack

Single-stack CDK deploy of the entire OpenSearch Analyzer (UI + API + state +
auth) into a customer's own AWS account.

## What this stack creates

| Resource | Purpose |
|---|---|
| VPC (2 AZs, 1 NAT) | Network for the Fargate task |
| ECS Fargate Service behind ALB | Runs the Docker image (UI + API on :3001) |
| DynamoDB table `opensearch-analyzer` | Domain records, findings, scan history |
| S3 bucket `opensearch-analyzer-audit-<account>-<region>` | Fix-engine audit log (versioned, 365d retention) |
| Cognito User Pool + Client | App login |
| IAM Task Role | Least-privilege grants for OpenSearch SigV4, CloudWatch, Secrets Manager (`opensearch-analyzer/*`), Bedrock (Anthropic models only), STS AssumeRole |

## Cost estimate (us-east-1, light usage)

Roughly $80–120/month:
- ALB: ~$22
- Fargate (1 task, 1 vCPU, 2 GiB): ~$30
- NAT Gateway: ~$32
- Everything else (DDB on-demand, S3, Cognito free tier, CW logs): single-digit dollars

## Prerequisites

- AWS CLI authenticated to the target account
- Docker installed and running (CDK builds the image locally before pushing to ECR)
- Node 20+
- The repo root must contain the working `Dockerfile` (it does — verified)

## First-time bootstrap

CDK needs a one-time per-account/region bootstrap to create its asset buckets:

```bash
cd infra/cdk
npm install
npx cdk bootstrap aws://<account-id>/<region>
```

## Deploy

```bash
cd infra/cdk
npx cdk deploy
```

The deploy takes ~10 minutes the first time (mostly Docker build + push). On
completion, CDK prints these outputs:

```
OpenSearchAnalyzerStack.AppUrl              http://OpenS-...-elb.amazonaws.com
OpenSearchAnalyzerStack.DynamoTableName     opensearch-analyzer
OpenSearchAnalyzerStack.AuditBucketName     opensearch-analyzer-audit-...
OpenSearchAnalyzerStack.UserPoolId          us-east-1_AbCdEfGhI
OpenSearchAnalyzerStack.UserPoolClientId    1a2b3c4d5e...
```

## First-time login

Cognito self-signup is disabled. Add the first user via the AWS CLI:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --temporary-password 'TempPassword!1'
```

Then visit `AppUrl`, log in, and set a permanent password.

## Connecting OpenSearch domains

The deployed task role is allowed to call `es:ESHttp*` on `*` resources, but
each customer OpenSearch domain still gates access via its own resource-based
policy. Add the task role to the domain policy:

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::<ACCOUNT>:role/OpenSearchAnalyzerStack-ServiceTaskDefTaskRole-..." },
  "Action": "es:ESHttp*",
  "Resource": "arn:aws:es:<region>:<ACCOUNT>:domain/<domain-name>/*"
}
```

For cross-account domains, use the `assumedRoleArn` field when adding the
domain — the stack already grants `sts:AssumeRole` on `*`.

## Bedrock access

You must enable model access for `anthropic.*` (specifically Sonnet 4.6) in
the Bedrock console for the deploy region. Without it, the chat agent fails
with `AccessDeniedException`.

## Updating

```bash
cd infra/cdk
npx cdk diff       # preview
npx cdk deploy     # apply
```

CDK rebuilds the Docker image on every deploy if anything in the repo changed.

## Tearing down

```bash
cd infra/cdk
npx cdk destroy
```

The DynamoDB table, S3 bucket, and Cognito user pool have `RemovalPolicy.RETAIN`
to prevent accidental data loss — `destroy` will leave them in place. Delete
them manually if you really want a full cleanup:

```bash
aws dynamodb delete-table --table-name opensearch-analyzer
aws s3 rb s3://opensearch-analyzer-audit-<account>-<region> --force
aws cognito-idp delete-user-pool --user-pool-id <UserPoolId>
```

## Verifying without deploying

`cdk synth` is the offline validator — runs entirely locally, no AWS calls
beyond AZ discovery:

```bash
cd infra/cdk
CDK_DEFAULT_ACCOUNT=<account> CDK_DEFAULT_REGION=<region> npx cdk synth
```

The output (`cdk.out/OpenSearchAnalyzerStack.template.json`) is a complete
CloudFormation template you can review or hand off to a security team before
running `deploy`.

## Customization

Common things you might want to override (edit `lib/opensearch-analyzer-stack.ts`):

- **Custom domain / TLS:** add `Route53 + ACM`, then attach to the ALB listener (currently HTTP only).
- **Larger task:** bump `cpu` / `memoryLimitMiB` / `desiredCount`.
- **VPC peering:** the analyzer Fargate task must reach customer OpenSearch domains. If those are VPC-only, attach this VPC via peering or use VPC endpoints.
- **Bedrock model:** change `BEDROCK_MODEL_ID` env var.
- **Audit log retention:** change `lifecycleRules.expiration`.
