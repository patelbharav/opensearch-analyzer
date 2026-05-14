import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { SopRuleSet } from "@osa/shared-types";
import {
  listSopRuleSets,
  getSopRuleSet,
  putSopRuleSet,
  deleteSopRuleSet,
  exportToYaml,
  importFromYaml,
} from "../persistence/sop.js";

export const sopRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const ruleSets = await listSopRuleSets();
    return { ruleSets };
  });

  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rs = await getSopRuleSet(id);
    if (!rs) return reply.notFound(`Rule set ${id} not found`);
    return rs;
  });

  app.post<{ Body: Omit<SopRuleSet, "id" | "createdAt" | "updatedAt"> }>("/", async (req) => {
    const now = new Date().toISOString();
    const rs: SopRuleSet = {
      ...req.body,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await putSopRuleSet(rs);
    return rs;
  });

  app.put<{ Body: SopRuleSet }>("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await getSopRuleSet(id);
    if (!existing) return reply.notFound(`Rule set ${id} not found`);
    const updated: SopRuleSet = {
      ...req.body,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await putSopRuleSet(updated);
    return updated;
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await getSopRuleSet(id);
    if (!existing) return reply.notFound(`Rule set ${id} not found`);
    await deleteSopRuleSet(id);
    return reply.code(204).send();
  });

  // ---- YAML export ----
  app.get("/:id/export", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rs = await getSopRuleSet(id);
    if (!rs) return reply.notFound(`Rule set ${id} not found`);
    const yaml = exportToYaml(rs);
    reply.header("content-type", "text/yaml; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="${rs.name.replace(/[^a-z0-9-_]/gi, "_")}.yaml"`);
    return yaml;
  });

  // ---- YAML import ----
  app.post<{ Body: string }>("/import", {
    config: { rawBody: true },
  }, async (req) => {
    const yamlStr = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const id = randomUUID();
    const rs = importFromYaml(yamlStr, id);
    await putSopRuleSet(rs);
    return rs;
  });
};
