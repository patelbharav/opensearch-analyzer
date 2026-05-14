import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { loadConfig, type AppConfig } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { embedDemoRoute } from "./routes/embedDemo.js";
import { ensureTable } from "./persistence/dynamo.js";
import { domainsRoutes } from "./routes/domains.js";
import { scanRoutes } from "./routes/scan.js";
import { findingsRoutes } from "./routes/findings.js";
import { fixRoutes } from "./routes/fix.js";
import { chatRoutes } from "./routes/chat.js";
import { metricsRoutes } from "./routes/metrics.js";
import { settingsRoutes } from "./routes/settings.js";
import { sopRoutes } from "./routes/sop.js";
import { authRoutes } from "./routes/auth.js";

export async function buildApp(config: AppConfig = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty", options: { colorize: true, singleLine: true } },
    },
  });

  await app.register(cors, { origin: config.corsOrigin, credentials: true });
  await app.register(sensible);

  // Security headers — CSP frame-ancestors controls who may embed the UI.
  // Note: only enforces against pages served by this API (production bundle).
  // The Vite dev server (5173) serves its own headers in development.
  const frameAncestors = config.embedAllowedOrigins.length > 0
    ? `frame-ancestors 'self' ${config.embedAllowedOrigins.join(" ")}`
    : "frame-ancestors 'self'";
  app.addHook("onSend", async (_req, reply) => {
    reply.header("Content-Security-Policy", frameAncestors);
    // X-Frame-Options is legacy and only supports SAMEORIGIN/DENY/single-origin
    // ALLOW-FROM. Modern browsers prefer CSP frame-ancestors and will ignore
    // X-Frame-Options when both are present, so we just send SAMEORIGIN as a
    // safe baseline for browsers that don't honor CSP yet.
    reply.header("X-Frame-Options", "SAMEORIGIN");
  });

  // Ensure the DynamoDB table exists before any route can fire.
  await ensureTable().catch((err) => {
    app.log.warn({ err }, "ensureTable failed (DynamoDB unavailable?) — will retry on first write");
  });

  await app.register(healthRoutes);
  await app.register(embedDemoRoute);
  await app.register(domainsRoutes, { prefix: "/api/domains" });
  await app.register(scanRoutes, { prefix: "/api/scan" });
  await app.register(findingsRoutes, { prefix: "/api/findings" });
  await app.register(fixRoutes, { prefix: "/api/fix" });
  await app.register(chatRoutes, { prefix: "/api/chat" });
  await app.register(metricsRoutes, { prefix: "/api/metrics" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(sopRoutes, { prefix: "/api/sop" });
  await app.register(authRoutes, { prefix: "/api/auth" });

  return app;
}
