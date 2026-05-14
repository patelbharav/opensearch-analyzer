import type { FastifyPluginAsync } from "fastify";
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { Readable } from "node:stream";
import { getDomain } from "../persistence/dynamo.js";
import { buildToolset } from "../agent/tools.js";
import { SYSTEM_PROMPT } from "../agent/prompts.js";
import { getModel } from "../agent/llm.js";

interface ChatBody {
  domainId: string;
  messages: UIMessage[];
}

const chatBodySchema = {
  type: "object",
  required: ["domainId", "messages"],
  properties: {
    domainId: { type: "string" },
    messages: { type: "array" },
  },
} as const;

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ChatBody }>(
    "/",
    { schema: { body: chatBodySchema } },
    async (req, reply) => {
      const { domainId, messages } = req.body;

      const domain = await getDomain(domainId);
      if (!domain) return reply.notFound(`Domain ${domainId} not found`);

      const tools = buildToolset(domain);

      const resolvedModel = await getModel();
      const modelMessages = await convertToModelMessages(messages);
      const result = streamText({
        model: resolvedModel,
        system: SYSTEM_PROMPT,
        messages: modelMessages,
        tools,
        // Allow the model up to 8 sequential tool calls per user turn so it
        // can ask follow-up questions of the cluster before answering.
        stopWhen: stepCountIs(8),
      });

      const response = result.toUIMessageStreamResponse();

      // Bridge the standard Web Response into Fastify's reply.
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      if (!response.body) return reply.send();
      return reply.send(Readable.fromWeb(response.body as never));
    },
  );
};
