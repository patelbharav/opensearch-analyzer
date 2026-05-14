#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OpenSearchAnalyzerStack } from "../lib/opensearch-analyzer-stack";

const app = new cdk.App();

new OpenSearchAnalyzerStack(app, "OpenSearchAnalyzerStack", {
  env: {
    // CDK will fall back to the AWS_ACCOUNT/AWS_REGION env or your active
    // profile if these are unset.
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  description:
    "Self-hosted OpenSearch Analyzer (UI + API) with DynamoDB state, S3 audit log, " +
    "Cognito login, and Bedrock-powered chat agent.",
});
