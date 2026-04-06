import { describe, it, expect } from "vitest";
import { checkOperationIds } from "../operation-ids.js";
import { checkSchemaTypes } from "../schema-types.js";
import { checkErrorSchemas } from "../error-schemas.js";
import { checkRequiredFields } from "../required-fields.js";
import { checkDescriptions } from "../descriptions.js";
import type { ParsedOpenApiSpec, OasOperation } from "../oas-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(overrides: Partial<ParsedOpenApiSpec> = {}): ParsedOpenApiSpec {
  return {
    info: { title: "Test API", version: "1.0.0" },
    paths: {},
    ...overrides,
  };
}

function makeSpecWithOps(
  ops: Array<{
    path: string;
    method: string;
    operationId?: string;
    description?: string;
    summary?: string;
    parameters?: Array<{ name: string; in?: string; description?: string; required?: boolean }>;
    requestBody?: Record<string, unknown>;
    responses?: Record<string, unknown>;
  }>,
): ParsedOpenApiSpec {
  const paths: Record<string, Record<string, OasOperation>> = {};
  for (const op of ops) {
    if (!paths[op.path]) paths[op.path] = {};
    paths[op.path][op.method] = {
      ...(op.operationId !== undefined ? { operationId: op.operationId } : {}),
      ...(op.description !== undefined ? { description: op.description } : {}),
      ...(op.summary !== undefined ? { summary: op.summary } : {}),
      ...(op.parameters ? { parameters: op.parameters } : {}),
      ...(op.requestBody ? { requestBody: op.requestBody } : {}),
      ...(op.responses ? { responses: op.responses } : {}),
    } as OasOperation;
  }
  return makeSpec({ paths });
}

// ---------------------------------------------------------------------------
// checkOperationIds
// ---------------------------------------------------------------------------

describe("checkOperationIds", () => {
  it("returns fail when spec is undefined", () => {
    const result = checkOperationIds(undefined);
    expect(result.status).toBe("fail");
  });

  it("returns fail when no operations exist", () => {
    const result = checkOperationIds(makeSpec());
    expect(result.status).toBe("fail");
    expect(result.data?.total).toBe(0);
  });

  it("returns pass when all operations have operationId", () => {
    const spec = makeSpecWithOps([
      { path: "/users", method: "get", operationId: "listUsers" },
      { path: "/users", method: "post", operationId: "createUser" },
    ]);
    const result = checkOperationIds(spec);
    expect(result.status).toBe("pass");
    expect(result.data?.total).toBe(2);
    expect(result.data?.missing).toBe(0);
  });

  it("returns partial when >=80% have operationId", () => {
    const spec = makeSpecWithOps([
      { path: "/a", method: "get", operationId: "a" },
      { path: "/b", method: "get", operationId: "b" },
      { path: "/c", method: "get", operationId: "c" },
      { path: "/d", method: "get", operationId: "d" },
      { path: "/e", method: "get" }, // missing
    ]);
    const result = checkOperationIds(spec);
    expect(result.status).toBe("partial");
    expect(result.data?.missing).toBe(1);
  });

  it("returns fail when <80% have operationId", () => {
    const spec = makeSpecWithOps([
      { path: "/a", method: "get", operationId: "a" },
      { path: "/b", method: "get" },
      { path: "/c", method: "get" },
      { path: "/d", method: "get" },
    ]);
    const result = checkOperationIds(spec);
    expect(result.status).toBe("fail");
  });

  it("ignores empty operationId strings", () => {
    const spec = makeSpecWithOps([
      { path: "/a", method: "get", operationId: "" },
      { path: "/b", method: "get", operationId: "  " },
    ]);
    const result = checkOperationIds(spec);
    expect(result.status).toBe("fail");
    expect(result.data?.missing).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// checkSchemaTypes
// ---------------------------------------------------------------------------

describe("checkSchemaTypes", () => {
  it("returns fail when spec is undefined", () => {
    const result = checkSchemaTypes(undefined);
    expect(result.status).toBe("fail");
  });

  it("returns fail when no schemas found", () => {
    const spec = makeSpecWithOps([
      { path: "/test", method: "get" },
    ]);
    const result = checkSchemaTypes(spec);
    expect(result.status).toBe("fail");
  });

  it("returns pass when all schemas have type", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "post",
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "200": { content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    ]);
    const result = checkSchemaTypes(spec);
    expect(result.status).toBe("pass");
  });

  it("returns pass when schemas use $ref", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "post",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
        },
      },
    ]);
    const result = checkSchemaTypes(spec);
    expect(result.status).toBe("pass");
  });

  it("returns fail when schemas lack type and $ref", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "post",
        requestBody: {
          content: { "application/json": { schema: {} } },
        },
        responses: {
          "200": { content: { "application/json": { schema: {} } } },
        },
      },
    ]);
    const result = checkSchemaTypes(spec);
    expect(result.status).toBe("fail");
    expect(result.data?.untyped).toBe(2);
  });

  it("only considers 2xx responses, not 4xx", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "get",
        responses: {
          "200": { content: { "application/json": { schema: { type: "array" } } } },
          "404": { content: { "application/json": { schema: {} } } },
        },
      },
    ]);
    const result = checkSchemaTypes(spec);
    expect(result.status).toBe("pass");
    expect(result.data?.total).toBe(1); // Only 200
  });
});

// ---------------------------------------------------------------------------
// checkErrorSchemas
// ---------------------------------------------------------------------------

describe("checkErrorSchemas", () => {
  it("returns fail when spec is undefined", () => {
    const result = checkErrorSchemas(undefined);
    expect(result.status).toBe("fail");
  });

  it("returns fail when no 4xx responses defined", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "get",
        responses: {
          "200": { description: "OK" },
        },
      },
    ]);
    const result = checkErrorSchemas(spec);
    expect(result.status).toBe("fail");
    expect(result.data?.total4xx).toBe(0);
  });

  it("returns pass when all 4xx have schemas", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "get",
        responses: {
          "400": { content: { "application/json": { schema: { type: "object" } } } },
          "404": { content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    ]);
    const result = checkErrorSchemas(spec);
    expect(result.status).toBe("pass");
    expect(result.data?.total4xx).toBe(2);
    expect(result.data?.withSchema).toBe(2);
  });

  it("returns partial when some 4xx have schemas", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "get",
        responses: {
          "400": { content: { "application/json": { schema: { type: "object" } } } },
          "404": { description: "Not found" },
        },
      },
    ]);
    const result = checkErrorSchemas(spec);
    expect(result.status).toBe("partial");
  });

  it("returns fail when no 4xx have schemas", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "get",
        responses: {
          "400": { description: "Bad request" },
          "404": { description: "Not found" },
        },
      },
    ]);
    const result = checkErrorSchemas(spec);
    expect(result.status).toBe("fail");
  });

  it("matches 4XX and 4xx wildcard codes", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "get",
        responses: {
          "4XX": { content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    ]);
    const result = checkErrorSchemas(spec);
    expect(result.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// checkRequiredFields
// ---------------------------------------------------------------------------

describe("checkRequiredFields", () => {
  it("returns pass when spec is undefined (nothing to evaluate)", () => {
    const result = checkRequiredFields(undefined);
    expect(result.status).toBe("pass");
  });

  it("returns pass when no request schemas have properties", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "post",
        requestBody: {
          content: { "application/json": { schema: { type: "string" } } },
        },
      },
    ]);
    const result = checkRequiredFields(spec);
    expect(result.status).toBe("pass");
  });

  it("returns pass when all schemas with properties have required", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "post",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { name: { type: "string" } },
                required: ["name"],
              },
            },
          },
        },
      },
    ]);
    const result = checkRequiredFields(spec);
    expect(result.status).toBe("pass");
  });

  it("returns fail when no schemas have required", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "post",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { name: { type: "string" }, email: { type: "string" } },
              },
            },
          },
        },
      },
      {
        path: "/posts",
        method: "post",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { title: { type: "string" } },
              },
            },
          },
        },
      },
    ]);
    const result = checkRequiredFields(spec);
    expect(result.status).toBe("fail");
  });

  it("returns partial when >=50% have required", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "post",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { name: { type: "string" } },
                required: ["name"],
              },
            },
          },
        },
      },
      {
        path: "/posts",
        method: "post",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { title: { type: "string" } },
              },
            },
          },
        },
      },
    ]);
    const result = checkRequiredFields(spec);
    expect(result.status).toBe("partial");
  });
});

// ---------------------------------------------------------------------------
// checkDescriptions
// ---------------------------------------------------------------------------

describe("checkDescriptions", () => {
  it("returns pass when spec is undefined (nothing to evaluate)", () => {
    const result = checkDescriptions(undefined);
    expect(result.status).toBe("pass");
  });

  it("returns pass when no parameters or properties exist", () => {
    const spec = makeSpecWithOps([
      { path: "/health", method: "get" },
    ]);
    const result = checkDescriptions(spec);
    expect(result.status).toBe("pass");
  });

  it("returns pass when >=80% have descriptions", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users/{id}",
        method: "get",
        parameters: [
          { name: "id", in: "path", description: "User ID" },
          { name: "fields", in: "query", description: "Comma-separated fields" },
        ],
      },
    ]);
    const result = checkDescriptions(spec);
    expect(result.status).toBe("pass");
    expect(result.data?.withDescription).toBe(2);
  });

  it("returns partial when 40-80% have descriptions", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users/{id}",
        method: "get",
        parameters: [
          { name: "id", in: "path", description: "User ID" },
          { name: "fields", in: "query", description: "Fields to return" },
          { name: "limit", in: "query" },
          { name: "offset", in: "query" },
          { name: "sort", in: "query" },
        ],
      },
    ]);
    const result = checkDescriptions(spec);
    // 2/5 = 40% → partial
    expect(result.status).toBe("partial");
  });

  it("returns fail when <40% have descriptions", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users/{id}",
        method: "get",
        parameters: [
          { name: "id", in: "path" },
          { name: "fields", in: "query" },
          { name: "limit", in: "query" },
          { name: "offset", in: "query" },
          { name: "sort", in: "query" },
        ],
      },
    ]);
    const result = checkDescriptions(spec);
    expect(result.status).toBe("fail");
  });

  it("samples properties from requestBody schemas", () => {
    const spec = makeSpecWithOps([
      {
        path: "/users",
        method: "post",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", description: "User name" },
                  email: { type: "string", description: "User email" },
                },
              },
            },
          },
        },
      },
    ]);
    const result = checkDescriptions(spec);
    expect(result.status).toBe("pass");
    expect(result.data?.withDescription).toBe(2);
  });
});
