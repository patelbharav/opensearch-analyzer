import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import type { Domain } from "@osa/shared-types";
import { loadConfig } from "../config.js";

const config = loadConfig();

const secretsClient = new SecretsManagerClient({
  region: config.awsRegion,
  endpoint: config.awsEndpointUrl,
});

const SECRET_PREFIX = "opensearch-analyzer/master-user/";

export interface MasterUserCredentials {
  username: string;
  password: string;
}

export async function storeMasterUserPassword(
  domainId: string,
  username: string,
  password: string,
): Promise<string> {
  const name = `${SECRET_PREFIX}${domainId}`;
  const res = await secretsClient.send(
    new CreateSecretCommand({
      Name: name,
      SecretString: JSON.stringify({ username, password }),
      Description: `OpenSearch Analyzer master-user creds for domain ${domainId}`,
    }),
  );
  if (!res.ARN) throw new Error("Secrets Manager did not return an ARN");
  return res.ARN;
}

export async function getMasterUserCredentials(
  domain: Domain,
): Promise<MasterUserCredentials> {
  if (!domain.masterPasswordSecretArn) {
    throw new Error(
      `Domain ${domain.id} is masterUser auth but has no masterPasswordSecretArn`,
    );
  }
  const res = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: domain.masterPasswordSecretArn }),
  );
  if (!res.SecretString) throw new Error("Secret has no SecretString");
  const parsed = JSON.parse(res.SecretString) as MasterUserCredentials;
  return parsed;
}

export async function deleteMasterUserSecret(secretArn: string): Promise<void> {
  await secretsClient.send(
    new DeleteSecretCommand({
      SecretId: secretArn,
      ForceDeleteWithoutRecovery: true,
    }),
  );
}
