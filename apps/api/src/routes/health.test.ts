import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = await buildApp({
      port: 0,
      host: "127.0.0.1",
      logLevel: "silent",
      corsOrigin: "*",
      awsRegion: "us-east-1",
      dynamoTableName: "test",
      auditBucket: "test-audit",
      embedAllowedOrigins: [],
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("opensearch-analyzer-api");
    await app.close();
  });
});
