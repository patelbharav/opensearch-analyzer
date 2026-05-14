import type { FastifyPluginAsync } from "fastify";
import {
  getDomain,
  getFindingById,
  recordFindingApplication,
} from "../persistence/dynamo.js";
import { executeFix, FixError } from "../fixes/engine.js";

interface ApplyBody {
  confirm?: boolean;
}

const applyBodySchema = {
  type: "object",
  properties: {
    confirm: { type: "boolean" },
  },
} as const;

export const fixRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ApplyBody }>(
    "/:findingId",
    { schema: { body: applyBodySchema } },
    async (req, reply) => {
      const { findingId } = req.params as { findingId: string };
      const finding = await getFindingById(findingId);
      if (!finding) return reply.notFound(`Finding ${findingId} not found`);

      const domain = await getDomain(finding.domainId);
      if (!domain) {
        return reply.notFound(`Domain ${finding.domainId} not found`);
      }

      try {
        const result = await executeFix({
          finding,
          domain,
          confirmed: req.body?.confirm === true,
          actor: "anonymous", // TODO: from Cognito JWT
        });
        await recordFindingApplication(finding, result);
        return result;
      } catch (err) {
        if (err instanceof FixError) {
          return reply.code(err.statusCode).send({
            error: err.name,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
};
