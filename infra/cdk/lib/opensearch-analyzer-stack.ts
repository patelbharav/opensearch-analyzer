import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "node:path";

/**
 * Single-stack deploy of the OpenSearch Analyzer.
 *
 * Architecture:
 *   ALB → ECS Fargate (single task running the Docker image) → DynamoDB + S3
 *                                                            → Cognito (login)
 *                                                            → Bedrock (chat)
 *                                                            → OpenSearch (customer domains via SigV4)
 *                                                            → CloudWatch (read metrics)
 *
 * What's NOT in this stack (customer responsibility):
 *  - Custom domain / TLS cert (use the ALB's default DNS or front it yourself).
 *  - The customer's OpenSearch domains (that's what the app diagnoses).
 *  - The IAM principals that need access (add via Cognito post-deploy).
 */
export class OpenSearchAnalyzerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------- networking --------------------
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    // -------------------- persistence --------------------
    const table = new dynamodb.TableV2(this, "AnalyzerTable", {
      tableName: "opensearch-analyzer",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.RETAIN, // keep findings on stack delete
      pointInTimeRecovery: true,
    });

    const auditBucket = new s3.Bucket(this, "AuditBucket", {
      bucketName: `opensearch-analyzer-audit-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Keep audit entries for 1 year by default — adjust for your
          // retention policy.
          expiration: cdk.Duration.days(365),
        },
      ],
    });

    // -------------------- auth --------------------
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "opensearch-analyzer-users",
      selfSignUpEnabled: false,        // operators add users explicitly
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const userPoolClient = userPool.addClient("WebClient", {
      authFlows: { userSrp: true },
      // Frontend reads JWT directly; no client secret.
      generateSecret: false,
    });

    // -------------------- container image --------------------
    // Build the existing Dockerfile at the repo root and push to ECR.
    const image = new ecrAssets.DockerImageAsset(this, "AppImage", {
      directory: path.resolve(__dirname, "../../.."),
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    // -------------------- ECS service --------------------
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "Service",
      {
        cluster,
        cpu: 1024,
        memoryLimitMiB: 2048,
        desiredCount: 1,
        publicLoadBalancer: true,
        taskImageOptions: {
          image: ecs.ContainerImage.fromDockerImageAsset(image),
          containerPort: 3001,
          environment: {
            PORT: "3001",
            HOST: "0.0.0.0",
            AWS_REGION: this.region,
            DYNAMO_TABLE_NAME: table.tableName,
            AUDIT_BUCKET: auditBucket.bucketName,
            COGNITO_USER_POOL_ID: userPool.userPoolId,
            COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
            BEDROCK_MODEL_ID: "us.anthropic.claude-sonnet-4-6",
            // The ALB DNS name isn't known until after deploy; allow same-origin
            // and update via context post-deploy if you front it with a custom domain.
            CORS_ORIGIN: "*",
          },
        },
        // Health check hits /health which doesn't require auth.
        healthCheckGracePeriod: cdk.Duration.seconds(60),
      },
    );

    service.targetGroup.configureHealthCheck({
      path: "/health",
      healthyHttpCodes: "200",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
    });

    // -------------------- IAM (least privilege) --------------------
    const taskRole = service.taskDefinition.taskRole;

    table.grantReadWriteData(taskRole);
    auditBucket.grantPut(taskRole);
    auditBucket.grantRead(taskRole);

    // OpenSearch Service: SigV4 signed HTTP calls to ANY domain. Customers
    // gate per-domain access via the domain's own access policy, so this
    // wildcard is the right shape.
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpPut", "es:ESHttpHead"],
        resources: ["*"],
      }),
    );

    // CloudWatch metrics — read-only.
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:GetMetricData", "cloudwatch:ListMetrics"],
        resources: ["*"],
      }),
    );

    // STS for the assumed-role flow (cross-account customer roles).
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: ["*"],
      }),
    );

    // Secrets Manager — the app creates per-domain secrets for master-user
    // passwords. Scope the prefix.
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:CreateSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:DeleteSecret",
          "secretsmanager:DescribeSecret",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:opensearch-analyzer/*`,
        ],
      }),
    );

    // Bedrock — chat agent. Scoped to Anthropic models only.
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Converse",
          "bedrock:ConverseStream",
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.*`,
          `arn:aws:bedrock:*::foundation-model/anthropic.*`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
          // Cross-region inference profiles route to other regions:
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      }),
    );

    // -------------------- outputs --------------------
    new cdk.CfnOutput(this, "AppUrl", {
      value: `http://${service.loadBalancer.loadBalancerDnsName}`,
      description: "Open this in a browser to access the analyzer.",
    });
    new cdk.CfnOutput(this, "DynamoTableName", {
      value: table.tableName,
    });
    new cdk.CfnOutput(this, "AuditBucketName", {
      value: auditBucket.bucketName,
    });
    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Add users via: aws cognito-idp admin-create-user ...",
    });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
  }
}
