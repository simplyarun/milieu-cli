import { describe, expect, it } from "vitest";
import { runSchemaBridge } from "../index.js";

const origin = "https://example.com";
function evaluate(spec: unknown) {
  return runSchemaBridge({ url: origin, domain: "example.com", baseUrl: origin, options: {}, shared: { openApiDetected: true, openApiSpec: spec } });
}

describe("Swagger 2.0 Schema observations", () => {
  it("gives equivalent inline OpenAPI 3 and referenced Swagger 2 contracts the same five check results", async () => {
    const payload = { type: "object", properties: { label: { type: "string", description: "Display label" } }, required: ["label"] };
    const error = { type: "object", properties: { message: { type: "string" } } };
    const filter = { in: "query", name: "filter", type: "string", description: "Display label filter" };
    const body = (schema: object) => ({ content: { "application/json": { schema } } });
    const modern = await evaluate({ openapi: "3.0.3", paths: { "/labels": { post: {
      operationId: "create", parameters: [filter], requestBody: body(payload),
      responses: { "201": body(payload), "400": body(error) },
    } } } });
    const swagger = await evaluate({
      swagger: "2.0",
      definitions: { "Label/Input": payload, Problem: error },
      parameters: { Input: { in: "body", name: "input", schema: { $ref: "#/definitions/Label~1Input" } }, Filter: filter },
      responses: { Created: { schema: { $ref: "#/definitions/Label~1Input" } }, Invalid: { schema: { $ref: "#/definitions/Problem" } } },
      paths: { "/labels": { parameters: [{ ...filter, description: undefined }, { $ref: "#/parameters/Input" }], post: {
        operationId: "create", parameters: [{ $ref: "#/parameters/Filter" }],
        responses: { "201": { $ref: "#/responses/Created" }, "400": { $ref: "#/responses/Invalid" } },
      } } },
    });
    expect(modern.score).toBe(100);
    expect(swagger.checks).toEqual(modern.checks);
    expect(swagger.checks.map(c => c.data)).toEqual([
      { total: 1, missing: 0 }, { total: 2, untyped: 0 }, { total4xx: 1, withSchema: 1 },
      { schemasWithProperties: 1, withRequired: 1 }, { sampled: 2, withDescription: 2 },
    ]);
  });

  it("counts undocumented, optional form fields and direct 4xx responses without schemas", async () => {
    const result = await evaluate({ swagger: "2.0", paths: { "/upload": { post: {
      operationId: "upload",
      parameters: [{ in: "formData", name: "file", type: "file" }, { in: "formData", name: "caption", type: "string" }],
      responses: { "200": { schema: { type: "string" } }, "400": { description: "Bad input" }, "404": { schema: { type: "object" } } },
    } } } });
    expect(result.checks.map(c => c.status)).toEqual(["pass", "pass", "partial", "fail", "fail"]);
    expect(result.checks[2].data).toEqual({ total4xx: 2, withSchema: 1 });
    expect(result.checks[3].data).toEqual({ schemasWithProperties: 1, withRequired: 0 });
    expect(result.checks[4].data).toEqual({ sampled: 2, withDescription: 0 });
  });

  it("reports missing, cyclic and external referenced inputs as unmeasured even beside a measured operation", async () => {
    const result = await evaluate({ swagger: "2.0", definitions: { Cycle: { $ref: "#/definitions/Cycle" } }, paths: {
      "/known": { post: { operationId: "known", parameters: [{ in: "body", name: "body", schema: { type: "object", properties: { a: { description: "A" } }, required: ["a"] } }] } },
      "/unknown": { post: { operationId: "unknown", parameters: [{ in: "body", name: "body", schema: { $ref: "#/definitions/Cycle" } }],
        responses: { "200": { $ref: "https://external.example/response.json" }, "401": { $ref: "#/responses/missing" } } } },
    } });
    expect(result.checks.map(c => c.status)).toEqual(["pass", "error", "error", "error", "error"]);
  });

  it("keeps response.schema, body parameters and requestBody.content scoped to their own dialect", async () => {
    const swagger = await evaluate({ swagger: "2.0", paths: { "/only": { post: {
      requestBody: { content: { "application/json": { schema: { type: "object" } } } },
      responses: { "200": { content: { "application/json": { schema: { type: "object" } } } } },
    } } } });
    const modern = await evaluate({ openapi: "3.0.3", paths: { "/only": { post: {
      parameters: [{ name: "x", in: "body", schema: { type: "object" } }],
      responses: { "200": { schema: { type: "object" } } },
    } } } });
    expect(swagger.checks[1].data).toEqual({ total: 0, untyped: 0 });
    expect(modern.checks[1].data).toEqual(swagger.checks[1].data);
  });

  it("does not report vacuous field passes for a composed Swagger model", async () => {
    const result = await evaluate({ swagger: "2.0", paths: { "/item": { post: { parameters: [
      { name: "item", in: "body", schema: { allOf: [{ type: "object", properties: { name: { type: "string" } } }] } },
    ] } } } });
    expect(result.checks[3].status).toBe("error");
    expect(result.checks[4].status).toBe("error");
  });

  it("preserves OpenAPI 3.1 boolean error-body schemas", async () => {
    const result = await evaluate({ openapi: "3.1.0", paths: { "/item": { get: {
      responses: { "403": { content: { "application/json": { schema: false } } } },
    } } } });
    expect(result.checks[2].data).toEqual({ total4xx: 1, withSchema: 1 });
  });
});
