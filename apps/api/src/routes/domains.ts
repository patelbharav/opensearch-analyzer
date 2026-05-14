import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { CreateDomainRequest, Domain } from "@osa/shared-types";
import {
  deleteDomain,
  getDomain,
  listDomains,
  putDomain,
} from "../persistence/dynamo.js";
import {
  deleteMasterUserSecret,
  storeMasterUserPassword,
} from "../opensearch/secrets.js";
import { buildTarget, pingTarget } from "../opensearch/target.js";

const createDomainSchema = {
  type: "object",
  required: ["name", "arn", "region", "endpoint", "authMode"],
  properties: {
    name: { type: "string", minLength: 1 },
    arn: { type: "string", minLength: 1 },
    region: { type: "string", minLength: 1 },
    endpoint: { type: "string", minLength: 1 },
    authMode: { type: "string", enum: ["sigv4", "masterUser", "cognito"] },
    assumedRoleArn: { type: "string" },
    masterUsername: { type: "string" },
    masterPassword: { type: "string" },
  },
} as const;

export const domainsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const domains = await listDomains();
    return { domains };
  });

  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getDomain(id);
    if (!domain) return reply.notFound(`Domain ${id} not found`);
    return domain;
  });

  app.post<{ Body: CreateDomainRequest }>(
    "/",
    { schema: { body: createDomainSchema } },
    async (req, reply) => {
      const body = req.body;

      if (body.authMode === "masterUser") {
        if (!body.masterUsername || !body.masterPassword) {
          return reply.badRequest(
            "masterUser auth requires masterUsername and masterPassword",
          );
        }
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      let masterPasswordSecretArn: string | undefined;
      if (body.authMode === "masterUser") {
        masterPasswordSecretArn = await storeMasterUserPassword(
          id,
          body.masterUsername!,
          body.masterPassword!,
        );
      }

      const domain: Domain = {
        id,
        name: body.name,
        arn: body.arn,
        region: body.region,
        endpoint: body.endpoint,
        authMode: body.authMode,
        assumedRoleArn: body.assumedRoleArn,
        masterUsername: body.masterUsername,
        masterPasswordSecretArn,
        createdAt: now,
      };

      await putDomain(domain);
      return reply.code(201).send(domain);
    },
  );

  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await getDomain(id);
    if (!existing) return reply.notFound(`Domain ${id} not found`);
    if (existing.masterPasswordSecretArn) {
      await deleteMasterUserSecret(existing.masterPasswordSecretArn).catch((err) => {
        app.log.warn({ err }, "failed to delete master-user secret");
      });
    }
    await deleteDomain(id);
    return reply.code(204).send();
  });

  app.post("/:id/test-connection", async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getDomain(id);
    if (!domain) return reply.notFound(`Domain ${id} not found`);
    const target = await buildTarget({ domain });
    const result = await pingTarget(target);
    if (!result.ok) return reply.code(502).send(result);
    return result;
  });

  // Allow testing creds before persisting (used by the Add Domain modal).
  app.post<{ Body: CreateDomainRequest }>(
    "/test-connection",
    { schema: { body: createDomainSchema } },
    async (req, reply) => {
      const body = req.body;
      const ephemeral: Domain = {
        id: "ephemeral",
        name: body.name,
        arn: body.arn,
        region: body.region,
        endpoint: body.endpoint,
        authMode: body.authMode,
        assumedRoleArn: body.assumedRoleArn,
        masterUsername: body.masterUsername,
        createdAt: new Date().toISOString(),
      };
      const target = await buildTarget({
        domain: ephemeral,
        masterUserPassword: body.masterPassword,
      });
      const result = await pingTarget(target);
      if (!result.ok) return reply.code(502).send(result);
      return result;
    },
  );
};
