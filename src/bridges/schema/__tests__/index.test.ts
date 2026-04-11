import { describe, it, expect } from "vitest";
import { runSchemaBridge } from "../index.js";
import type { ScanContext } from "../../../core/types.js";

function makeCtx(openApiSpec?: unknown): ScanContext {
  return {
    url: "https://example.com", domain: "example.com", baseUrl: "https://example.com",
    options: { timeout: 5000 },
    shared: { openApiDetected: openApiSpec != null, openApiSpec: openApiSpec ?? null },
  };
}

const FULL_SPEC = {
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers", description: "List all users",
        parameters: [{ name: "limit", in: "query", description: "Page size" }],
        responses: {
          "200": { content: { "application/json": { schema: { type: "array" } } } },
          "400": { content: { "application/json": { schema: { type: "object" } } } },
        },
      },
      post: {
        operationId: "createUser", description: "Create a user",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { name: { type: "string", description: "User name" } }, required: ["name"] } } },
        },
        responses: {
          "201": { content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          "422": { content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
  },
};

describe("runSchemaBridge", () => {
  it("returns BridgeResult with id 4, name Schema, status evaluated", async () => {
    const result = await runSchemaBridge(makeCtx(FULL_SPEC));
    expect(result.id).toBe(4);
    expect(result.name).toBe("Schema");
    expect(result.status).toBe("evaluated");
  });

  it("returns 5 checks in correct order", async () => {
    const result = await runSchemaBridge(makeCtx(FULL_SPEC));
    expect(result.checks).toHaveLength(5);
    expect(result.checks.map((c) => c.id)).toEqual([
      "schema_operation_ids", "schema_types_defined", "schema_error_responses",
      "schema_required_fields", "schema_descriptions",
    ]);
  });

  it("returns high score for well-formed spec", async () => {
    const result = await runSchemaBridge(makeCtx(FULL_SPEC));
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.scoreLabel).toBe("pass");
  });

  it("returns score null with nuanced no-spec messages when no spec available", async () => {
    const result = await runSchemaBridge(makeCtx(null));
    expect(result.score).toBeNull();
    expect(result.scoreLabel).toBeNull();
    expect(result.checks).toHaveLength(5);
    for (const check of result.checks) {
      expect(check.status).toBe("fail");
      expect(check.detail).toBeDefined();
      expect(check.detail!.length).toBeGreaterThan(20);
    }
    // Verify messages are unique per check
    const details = result.checks.map((c) => c.detail);
    expect(new Set(details).size).toBe(5);
  });

  it("returns numeric score and durationMs", async () => {
    const result = await runSchemaBridge(makeCtx(FULL_SPEC));
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.durationMs).toBe("number");
  });
});
