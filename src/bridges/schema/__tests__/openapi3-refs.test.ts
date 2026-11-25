import { describe, expect, it } from "vitest";
import { runSchemaBridge } from "../index.js";
import { operationParameters, resolveRequestBody } from "../schema-sources.js";
import { collectOperations, hasUnreadPathItems, type ParsedOpenApiSpec } from "../oas-types.js";

const ref = (path: string) => ({ $ref: path });
const media = <T>(schema: T) => ({ content: { "application/json": { schema } } });
const payload = { type: "object", properties: { field: { type: "string" } } };
const response = { description: "Result", ...media({ type: "object" }) };

function evaluateSpec(spec: object) {
  const origin = "https://example.com";
  return runSchemaBridge({ url: origin, baseUrl: origin, domain: "example.com", shared: { openApiDetected: true, openApiSpec: spec }, options: {} });
}

function evaluate(op: object, components: object = {}, extra: object = {}, openapi = "3.0.3") {
  return evaluateSpec({ openapi, info: { title: "Items", version: "1" }, components, paths: { "/items": { ...extra, post: {
    operationId: "create", responses: { "200": response, "400": response }, ...op,
  } } } });
}

describe("OpenAPI 3 reference observations", () => {
  it("keeps the same grades and runtime inputs when a complete 3.1 path item moves into components", async () => {
    const item = { servers: [{ url: "/v1" }], parameters: [{ in: "query", name: "filter" }],
      post: { operationId: "create", security: [{ token: [] }], requestBody: media(payload),
        responses: { "200": response, "400": response } } };
    const spec = { openapi: "3.1.0", info: { title: "Items", version: "1" }, components: {
      securitySchemes: { token: { type: "http", scheme: "bearer" } }, pathItems: { Items: item },
    } };
    const inline = await evaluateSpec({ ...spec, paths: { "/items": item } });
    const referenced = { ...spec, paths: { "/items": ref("#/components/pathItems/Items") } };
    const result = await evaluateSpec(referenced);
    expect(inline.score).toBe(60);
    expect(result.checks).toEqual(inline.checks);
    expect(result.score).toBe(inline.score);
    expect(collectOperations(referenced)).toEqual([["/items", "post", item.post]]);
    expect(operationParameters(referenced, "/items", item.post)).toEqual(item.parameters);
  });

  it.each(["path-items.yaml#/Items", "#/components/pathItems/Absent", "#/components/pathItems/Loop"])(
    "leaves Schema unmeasured when %s may hide operations, including beside a known path", async pointer => {
      const spec: ParsedOpenApiSpec = { openapi: "3.1.0", components: { pathItems: { Loop: ref("#/components/pathItems/Loop") } },
        paths: { "/known": { get: { operationId: "known" } }, "/items": ref(pointer) } };
      expect(hasUnreadPathItems(spec)).toBe(true);
      expect(collectOperations(spec)).toHaveLength(1);
      const result = await evaluateSpec(spec);
      expect(result).toMatchObject({ status: "not_evaluated", score: null, scoreLabel: null, checks: [] });
      expect(result.message).toContain("path item");
    },
  );
  it("keeps the same five grades when requests, successful and error responses move into local components", async () => {
    const inline = await evaluate({ requestBody: media(payload) });
    const referenced = await evaluate({
      requestBody: ref("#/components/requestBodies/Input"),
      responses: { "200": ref("#/components/responses/Result"), "400": ref("#/components/responses/Result") },
    }, {
      schemas: { "Input/Model": payload, Result: { type: "object" } },
      requestBodies: { Input: media(ref("#/components/schemas/Input~1Model")) },
      responses: { Result: { description: "Result", ...media(ref("#/components/schemas/Result")) } },
    });
    expect(inline.score).toBe(60);
    expect(inline.checks.map(c => c.status)).toEqual(["pass", "pass", "pass", "fail", "fail"]);
    expect(referenced.score).toBe(inline.score);
    expect(referenced.checks).toEqual(inline.checks);
  });

  it.each(["https://example.net/document.json#/Input", "#/components/schemas/Missing", "#/components/schemas/Loop", "#/components/schemas/bad~2name", "#anchor"])(
    "marks unread request and response schemas unmeasured for %s", async pointer => {
      const result = await evaluate({
        requestBody: media(ref(pointer)),
        responses: { "200": response, "400": media(ref(pointer)) },
      }, { schemas: { Loop: ref("#/components/schemas/Loop") } });
      expect(result.checks.map(c => c.status)).toEqual(["pass", "error", "error", "error", "error"]);
    },
  );

  it("keeps independently observed response media when a second representation is unresolved", async () => {
    const result = await evaluate({ responses: { "400": { description: "Bad input", content: {
      "application/json": { schema: ref("#/components/schemas/Unknown") }, "text/plain": { schema: { type: "string" } },
    } } } });
    expect(result.checks[2].status).toBe("pass");
  });

  it("distinguishes uninspectable requestBody or response objects from an absent body", async () => {
    const result = await evaluate({ requestBody: ref("#/components/requestBodies/Absent"),
      responses: { "201": ref("#/components/responses/Absent"), "400": ref("responses.json#/Error") } });
    expect(result.checks.map(c => c.status)).toEqual(["pass", "error", "error", "error", "error"]);
  });

  it("uses effective path and operation parameters and resolves referenced field descriptions", async () => {
    const filter = { in: "query", name: "filter", description: "Filter term" };
    const pathParameter = { in: "path", name: "id", description: "Item identifier" };
    const fields = { type: "string", description: "Field name" };
    const effectiveModel = { type: "object", properties: { name: fields }, required: ["name"] };
    const inline = await evaluate({ requestBody: media(effectiveModel), parameters: [filter, pathParameter] });
    const referenced = await evaluate({
      requestBody: media({ ...effectiveModel, properties: { name: ref("#/components/schemas/Field") } }),
      parameters: [ref("#/components/parameters/Filter")],
    }, { parameters: { Filter: filter, ID: pathParameter }, schemas: { Field: fields } },
    { parameters: [{ in: "query", name: "filter" }, ref("#/components/parameters/ID")] });
    expect(referenced.checks).toEqual(inline.checks);
    expect(referenced.checks[4].data).toEqual({ sampled: 3, withDescription: 3 });
    const unknown = await evaluate({ parameters: [ref("#/components/parameters/Unknown")] });
    expect(unknown.checks[4].status).toBe("error");
  });

  it("keeps parameter and body references usable for selecting a runtime operation", () => {
    const spec = { openapi: "3.0.3", components: {
      parameters: { Key: { in: "query", name: "key", required: true } },
      requestBodies: { Input: { ...media(payload), required: true } },
    } };
    const op = { parameters: [ref("#/components/parameters/Key"), ref("external.json#/arg")], requestBody: ref("#/components/requestBodies/Input") };
    expect(operationParameters(spec, "/items", op)).toEqual([spec.components.parameters.Key, op.parameters[1]]);
    expect(resolveRequestBody(spec, op)).toBe(spec.components.requestBodies.Input);
    expect(resolveRequestBody(spec, { requestBody: ref("external.json#/body") })).toBeUndefined();
  });

  it.each(["allOf", "anyOf", "oneOf"])("keeps fields hidden in %s unmeasured", async keyword => {
    const result = await evaluate({ requestBody: media(ref("#/components/schemas/Input")) }, {
      schemas: { Input: { [keyword]: [payload] } },
    });
    expect(result.checks.slice(3).map(c => c.status)).toEqual(["error", "error"]);
  });

  it("honors OpenAPI 3.1 description siblings and declines unsupported structural siblings", async () => {
    const field = { type: "string" };
    const scoped = { $ref: "#/components/schemas/Field", description: "Field at use site" };
    const body = (property: object) => ({ requestBody: media({ ...payload, properties: { field: property } }) });
    const components = { schemas: { Field: field } };
    const newer = await evaluate(body(scoped), components, {}, "3.1.1");
    const booleanTarget = await evaluate(body(scoped), { schemas: { Field: false } }, {}, "3.1.1");
    const older = await evaluate(body(scoped), components);
    const unknown = await evaluate(body({ ...scoped, allOf: [field] }), components, {}, "3.1.1");
    expect(newer.checks[4].status).toBe("pass");
    expect(booleanTarget.checks[4].status).toBe("pass");
    expect(older.checks[4].status).toBe("fail");
    expect(unknown.checks[4].status).toBe("error");
  });

  it.each([true, false])("keeps inline and referenced OpenAPI 3.1 boolean payloads (%s) equivalent", async value => {
    const operation = (schema: unknown) => ({ requestBody: media(schema), responses: { "200": media(schema), "400": media(schema) } });
    const inline = await evaluate(operation(value), {}, {}, "3.1.0");
    const referenced = await evaluate(operation(ref("#/components/schemas/Flag")), { schemas: { Flag: value } }, {}, "3.1.0");
    expect(referenced.checks).toEqual(inline.checks);
    expect(inline.checks[1].data).toEqual({ total: 2, untyped: 2 });
    expect(inline.checks[2].data).toEqual({ total4xx: 1, withSchema: 1 });
  });

  it("bounds resolution of long acyclic chains", async () => {
    const schemas: Record<string, object> = Object.fromEntries(Array.from({ length: 75 }, (_, i) => ["N" + i, ref("#/components/schemas/N" + (i + 1))]));
    schemas.N75 = payload;
    const result = await evaluate({ requestBody: media(ref("#/components/schemas/N0")) }, { schemas });
    expect(result.checks[3].status).toBe("error");
  });
});
