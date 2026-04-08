import { describe, it, expect } from "vitest";
import { collectOperations } from "../oas-types.js";
import type { ParsedOpenApiSpec, OasOperation } from "../oas-types.js";
import { checkOperationIds } from "../operation-ids.js";
import { checkSchemaTypes } from "../schema-types.js";
import { checkErrorSchemas } from "../error-schemas.js";
import { checkRequiredFields } from "../required-fields.js";
import { checkDescriptions } from "../descriptions.js";

describe("collectOperations", () => {
  it("returns empty array for undefined spec", () => {
    expect(collectOperations(undefined)).toEqual([]);
  });

  it("returns empty array for spec with no paths", () => {
    expect(collectOperations({ paths: {} })).toEqual([]);
  });

  it("collects operations from paths", () => {
    const spec: ParsedOpenApiSpec = {
      paths: {
        "/users": {
          get: { operationId: "listUsers" },
          post: { operationId: "createUser" },
        },
        "/items": {
          get: { operationId: "listItems" },
        },
      },
    };
    const ops = collectOperations(spec);
    expect(ops).toHaveLength(3);
    expect(ops[0]).toEqual(["/users", "get", { operationId: "listUsers" }]);
    expect(ops[1]).toEqual(["/users", "post", { operationId: "createUser" }]);
    expect(ops[2]).toEqual(["/items", "get", { operationId: "listItems" }]);
  });

  it("ignores non-method keys like parameters", () => {
    const spec: ParsedOpenApiSpec = {
      paths: {
        "/users": {
          get: { operationId: "listUsers" },
          parameters: [{ name: "id" }],
        } as unknown as Record<string, OasOperation>,
      },
    };
    const ops = collectOperations(spec);
    expect(ops).toHaveLength(1);
  });
});

describe("checkOperationIds", () => {
  it("returns pass when all operations have operationId", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/users": { get: { operationId: "listUsers" }, post: { operationId: "createUser" } } },
    };
    const result = checkOperationIds(spec);
    expect(result.id).toBe("schema_operation_ids");
    expect(result.status).toBe("pass");
  });
  it("returns fail when no operations exist", () => {
    expect(checkOperationIds({ paths: {} }).status).toBe("fail");
  });
  it("returns fail when most operations lack operationId", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/a": { get: {}, post: {}, put: {}, delete: {}, patch: {} }, "/b": { get: { operationId: "one" } } },
    };
    expect(checkOperationIds(spec).status).toBe("fail");
  });
  it("returns partial when >=80% have operationId but not all", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/a": { get: { operationId: "a" }, post: { operationId: "b" }, put: { operationId: "c" }, delete: { operationId: "d" } }, "/b": { get: {} } },
    };
    expect(checkOperationIds(spec).status).toBe("partial");
  });
  it("returns fail for undefined spec", () => {
    expect(checkOperationIds(undefined).status).toBe("fail");
  });
});

describe("checkSchemaTypes", () => {
  it("returns pass when all schemas have type or $ref", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/users": { post: { requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } } } } },
    };
    expect(checkSchemaTypes(spec).status).toBe("pass");
  });
  it("returns fail when no schemas found", () => {
    expect(checkSchemaTypes({ paths: { "/health": { get: { responses: { "200": {} } } } } }).status).toBe("fail");
  });
  it("returns fail for undefined spec", () => {
    expect(checkSchemaTypes(undefined).status).toBe("fail");
  });
});

describe("checkErrorSchemas", () => {
  it("returns pass when all 4xx responses have schemas", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/users": { get: { responses: { "200": { content: { "application/json": { schema: { type: "object" } } } }, "404": { content: { "application/json": { schema: { type: "object" } } } } } } } },
    };
    expect(checkErrorSchemas(spec).status).toBe("pass");
  });
  it("returns fail when no 4xx responses defined", () => {
    expect(checkErrorSchemas({ paths: { "/health": { get: { responses: { "200": {} } } } } }).status).toBe("fail");
  });
  it("returns partial when some 4xx responses have schemas", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/users": { get: { responses: { "400": { content: { "application/json": { schema: { type: "object" } } } }, "404": {} } } } },
    };
    expect(checkErrorSchemas(spec).status).toBe("partial");
  });
  it("returns fail for undefined spec", () => {
    expect(checkErrorSchemas(undefined).status).toBe("fail");
  });
});

describe("checkRequiredFields", () => {
  it("returns pass when all request body schemas declare required", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/users": { post: { requestBody: { content: { "application/json": { schema: { properties: { name: { type: "string" } }, required: ["name"] } } } } } } },
    };
    expect(checkRequiredFields(spec).status).toBe("pass");
  });
  it("returns pass when no request body schemas have properties", () => {
    expect(checkRequiredFields({ paths: { "/health": { get: {} } } }).status).toBe("pass");
  });
  it("returns fail when no schemas declare required", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/users": { post: { requestBody: { content: { "application/json": { schema: { properties: { name: { type: "string" } } } } } } } } },
    };
    expect(checkRequiredFields(spec).status).toBe("fail");
  });
  it("returns pass for undefined spec (no schemas to evaluate)", () => {
    expect(checkRequiredFields(undefined).status).toBe("pass");
  });
});

describe("checkDescriptions", () => {
  it("returns pass when >=80% of sampled fields have descriptions", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/users": { get: { parameters: [{ name: "id", in: "path", description: "User ID" }, { name: "limit", in: "query", description: "Page size" }] } } },
    };
    expect(checkDescriptions(spec).status).toBe("pass");
  });
  it("returns pass when no parameters or properties to evaluate", () => {
    expect(checkDescriptions({ paths: { "/health": { get: {} } } }).status).toBe("pass");
  });
  it("returns fail when <40% have descriptions", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/users": { get: { parameters: [{ name: "id", in: "path" }, { name: "limit", in: "query" }, { name: "offset", in: "query" }, { name: "sort", in: "query" }, { name: "filter", in: "query" }] } } },
    };
    expect(checkDescriptions(spec).status).toBe("fail");
  });
  it("returns pass for undefined spec (no fields to evaluate)", () => {
    expect(checkDescriptions(undefined).status).toBe("pass");
  });
});
