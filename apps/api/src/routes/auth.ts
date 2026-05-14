import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import jwt from "jsonwebtoken";
import type { UserProfile, ActionRecord } from "@osa/shared-types";
import {
  createUser,
  verifyPassword,
  updateLastLogin,
  listUsers,
  recordAction,
  listActions,
  listAllActions,
} from "../persistence/users.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "osa-dev-secret-change-in-production";
const JWT_EXPIRY = "24h";

function signToken(user: UserProfile): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY },
  );
}

export function verifyToken(token: string): { userId: string; username: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: string };
  } catch {
    return null;
  }
}

export function extractUser(req: { headers: { authorization?: string } }): { userId: string; username: string; role: string } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { username: string; password: string; displayName?: string } }>(
    "/register",
    async (req, reply) => {
      const { username, password, displayName } = req.body;
      if (!username || !password) return reply.badRequest("username and password required");
      if (password.length < 6) return reply.badRequest("password must be at least 6 characters");

      const user: UserProfile = {
        id: randomUUID(),
        username,
        displayName: displayName ?? username,
        role: "operator",
        createdAt: new Date().toISOString(),
      };

      try {
        await createUser(user, password);
      } catch (err) {
        const code = (err as { name?: string }).name;
        if (code === "ConditionalCheckFailedException") {
          return reply.code(409).send({ error: "Username already taken" });
        }
        throw err;
      }

      const token = signToken(user);
      await recordAction({
        id: randomUUID(),
        userId: user.id,
        username: user.username,
        action: "login",
        description: `User ${user.username} registered and logged in`,
        timestamp: new Date().toISOString(),
      });

      return { user, token };
    },
  );

  app.post<{ Body: { username: string; password: string } }>(
    "/login",
    async (req, reply) => {
      const { username, password } = req.body;
      if (!username || !password) return reply.badRequest("username and password required");

      const user = await verifyPassword(username, password);
      if (!user) return reply.code(401).send({ error: "Invalid username or password" });

      await updateLastLogin(username);
      const token = signToken(user);

      await recordAction({
        id: randomUUID(),
        userId: user.id,
        username: user.username,
        action: "login",
        description: `User ${user.username} logged in`,
        timestamp: new Date().toISOString(),
      });

      return { user, token };
    },
  );

  app.get("/me", async (req, reply) => {
    const user = extractUser(req);
    if (!user) return reply.code(401).send({ error: "Not authenticated" });
    return user;
  });

  app.get("/users", async () => {
    const users = await listUsers();
    return { users };
  });

  app.get("/actions", async (req) => {
    const user = extractUser(req);
    const { userId } = req.query as { userId?: string };
    if (userId) {
      return { actions: await listActions(userId) };
    }
    if (user) {
      return { actions: await listActions(user.userId) };
    }
    return { actions: await listAllActions() };
  });
};
