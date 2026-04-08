import { describe, it, expect } from "vitest";
import { collectOperations } from "../oas-types.js";
import type { ParsedOpenApiSpec } from "../oas-types.js";

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
        } as Record<string, unknown>,
      },
    };
    const ops = collectOperations(spec);
    expect(ops).toHaveLength(1);
  });
});
