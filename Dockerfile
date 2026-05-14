# syntax=docker/dockerfile:1.6

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /workspace

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/diagnostics-core/package.json packages/diagnostics-core/

RUN --mount=type=cache,target=/root/.npm \
    npm install --workspaces --include-workspace-root

COPY . .

RUN npm --workspace @osa/web run build \
 && npm --workspace @osa/api run build

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

COPY --from=builder /workspace/package.json /workspace/package-lock.json* ./
COPY --from=builder /workspace/apps/api/package.json apps/api/
COPY --from=builder /workspace/packages/shared-types/package.json packages/shared-types/

RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --workspaces --include-workspace-root

COPY --from=builder /workspace/apps/api/dist apps/api/dist
COPY --from=builder /workspace/packages/shared-types/src packages/shared-types/src
COPY --from=builder /workspace/apps/web/dist apps/web/dist

EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
