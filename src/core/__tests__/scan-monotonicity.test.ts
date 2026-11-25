import { dump as dumpYaml } from "js-yaml";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ScanOutcome, ScanResult } from "../types.js";

// Real bridges, real HTTP client — only DNS and the network are stubbed.
// This exercises scan() end-to-end through all five bridges and the shared
// context, which the per-module unit tests never do.
vi.mock("../../utils/ssrf.js", () => ({
  validateDns: vi.fn(async () => ({ safe: true, ip: "93.184.216.34" })),
  isPrivateIp: vi.fn(() => false),
}));

// The client calls undici's own fetch; route it back to the stubbed global
// fetch so networkStub() keeps intercepting the transport.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    fetch: (input: unknown, init?: unknown) =>
      (globalThis.fetch as (i: unknown, n?: unknown) => Promise<Response>)(input, init),
  };
});

import { scan } from "../scan.js";
import { compareReports } from "../diff.js";

function assertOk(outcome: ScanOutcome): asserts outcome is ScanResult {
  expect(outcome.ok).toBe(true);
}

const OPENAPI_SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        responses: { "200": { description: "A list of users" } },
      },
    },
  },
});

/** A fetch stub: 404 for everything except (optionally) a self-hosted spec. */
function networkStub(serveSpec: boolean, format: "json" | "yaml" = "json") {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (serveSpec && url.endsWith(`/openapi.${format}`)) {
      return new Response(format === "yaml" ? dumpYaml(JSON.parse(OPENAPI_SPEC)) : OPENAPI_SPEC, {
        status: 200,
        headers: { "content-type": `application/${format}` },
      });
    }
    return new Response("", { status: 404 });
  });
}

describe("scan() scoring is monotone and reproducible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("compares serialized scans when a release removes guidance from the same 401", async () => {
    const origin = "https://example.com";
    const spec = {
      openapi: "3.1.0", info: { title: "Projects", version: "1" },
      paths: { "/projects": { get: { operationId: "listProjects", security: [{ bearer: [] }] } } },
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    };
    let includeChallenge = true;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url === origin + "/openapi.json") return Response.json(spec);
      if (url === origin + "/projects") {
        const headers = new Headers({ "content-type": "application/json" });
        if (includeChallenge) headers.set("www-authenticate", "Bearer");
        return new Response('{"error":"unauthorized"}', { status: 401, headers });
      }
      if (url === origin || url === origin + "/") return new Response("Public homepage");
      return new Response("", { status: 404 });
    });
    const base = await scan(origin, { silent: true });
    includeChallenge = false;
    const head = await scan(origin, { silent: true });
    assertOk(base);
    assertOk(head);
    const auth = (report: ScanResult) => report.bridges[4].checks.find(c => c.id === "context_auth_legibility");
    expect(auth(base)?.status).toBe("partial");
    expect(auth(head)?.status).toBe("partial");
    const diff = compareReports(JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(head)));
    expect(diff.findings).toMatchObject([{ bridgeId: 5, kind: "regression", target: "GET /projects" }]);
  });

  it("publishing an OpenAPI spec never lowers the overall score", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const noSpec = await scan("https://example.com", { silent: true });
    assertOk(noSpec);

    vi.stubGlobal("fetch", networkStub(true));
    const withSpec = await scan("https://example.com", { silent: true });
    assertOk(withSpec);

    // The whole point of monotone scoring: adding a signal can only help.
    expect(withSpec.overallScore).toBeGreaterThanOrEqual(noSpec.overallScore);
    // And in this case it strictly helps — the spec is discoverable.
    expect(withSpec.overallScore).toBeGreaterThan(noSpec.overallScore);
  });

  it("distinguishes an SDK inventory change from losing the last published route to a still-reachable contract", async () => {
    const origin = "https://release.example.com";
    let sdk = '<a href="https://www.npmjs.com/package/@example/projects">Projects package</a>';
    const commonSdk = '<a href="https://www.npmjs.com/package/@example/client">Client package</a>';
    let link = '<a href="/openapi.json">OpenAPI contract</a>';
    let docsStatus = 200;
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(input);
      const html = (body: string, status = 200) =>
        new Response("<html><body>" + body + "</body></html>", { status, headers: { "content-type": "text/html" } });
      if (url.origin === origin) {
        if (url.pathname === "/") return html('<a href="/docs">Developer docs</a>');
        if (url.pathname === "/docs") return html(link + sdk + commonSdk, docsStatus);
        if (url.pathname === "/openapi.json") return new Response(OPENAPI_SPEC, { headers: { "content-type": "application/json" } });
      }
      return new Response("", { status: 404 });
    });
    const capture = async () => {
      const outcome = await scan(origin, { silent: true });
      assertOk(outcome);
      return JSON.parse(JSON.stringify(outcome)) as ScanResult;
    };
    const base = await capture();
    sdk = "";
    const withoutSdk = await capture();
    link = "";
    const withoutLink = await capture();
    docsStatus = 403;
    const unreadableDocs = await capture();

    expect(base.bridges[1].checks.find(c => c.id === "openapi_spec")?.data?.documentUrl).toBe(origin + "/openapi.json");
    expect(base.bridges[3].score).toBeGreaterThan(0);
    for (const release of [withoutSdk, withoutLink]) {
      expect(release.bridges.map(b => b.score)).toEqual(base.bridges.map(b => b.score));
      expect(release.overallScore).toBe(base.overallScore);
      expect(release.bridges[3].checks).toEqual(base.bridges[3].checks);
    }
    for (const release of [base, withoutSdk]) {
      expect(release.bridges[2].checks.find(c => c.id === "sdk_references")?.status).toBe("pass");
    }
    expect(compareReports(base, withoutSdk).findings).toMatchObject([{
      bridgeId: 3, checkId: "sdk_references", kind: "inventory", target: "https://www.npmjs.com/package/@example/projects" }]);
    expect(compareReports(withoutSdk, withoutLink).findings).toMatchObject([{
      bridgeId: 3, checkId: "api_presence", capabilityId: "openapi-description", kind: "regression",
      before: expect.stringContaining("/docs → /openapi.json"), after: expect.stringContaining("No route observed"),
    }]);
    expect(compareReports(withoutSdk, unreadableDocs).findings.filter(f => f.capabilityId))
      .toMatchObject([{ kind: "inconclusive", after: expect.stringContaining("coverage incomplete") }]);
  });

  it("Bridge 4 scores 0 (not null) with no spec, and > 0 once a spec is found", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const noSpec = await scan("https://example.com", { silent: true });
    assertOk(noSpec);
    expect(noSpec.bridges[3].id).toBe(4);
    expect(noSpec.bridges[3].score).toBe(0);

    vi.stubGlobal("fetch", networkStub(true));
    const withSpec = await scan("https://example.com", { silent: true });
    assertOk(withSpec);
    expect(withSpec.bridges[3].score).toBeGreaterThan(0);
  });

  it("scores equivalent JSON and YAML contracts identically throughout the scan", async () => {
    vi.stubGlobal("fetch", networkStub(true, "json"));
    const json = await scan("https://example.com", { silent: true });
    assertOk(json);
    vi.stubGlobal("fetch", networkStub(true, "yaml"));
    const yaml = await scan("https://example.com", { silent: true });
    assertOk(yaml);

    expect(yaml.bridges[1].checks.find(c => c.id === "openapi_spec")?.status).toBe("pass");
    expect(yaml.bridges[3].score).toBeGreaterThan(0);
    expect(yaml.bridges[3].checks).toEqual(json.bridges[3].checks);
    expect(yaml.bridges[4].checks).toEqual(json.bridges[4].checks);
    expect(yaml.bridges.map(b => b.score)).toEqual(json.bridges.map(b => b.score));
    expect(yaml.overallScore).toBe(json.overallScore);
  });

  it("produces the same score for the same surface state (reproducible)", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const first = await scan("https://example.com", { silent: true });
    assertOk(first);

    vi.stubGlobal("fetch", networkStub(false));
    const second = await scan("https://example.com", { silent: true });
    assertOk(second);

    expect(second.overallScore).toBe(first.overallScore);
    expect(second.bridges.map((b) => b.score)).toEqual(
      first.bridges.map((b) => b.score),
    );
  });

  it("only Bridge 3 is unscored when discovery completes and finds no spec", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const result = await scan("https://example.com", { silent: true });
    assertOk(result);

    const nullScored = result.bridges.filter((b) => b.score === null).map((b) => b.id);
    expect(nullScored).toEqual([3]);
  });

  it("averages three scored bridges when the contract is protected, retaining independent Context evidence", async () => {
    const origin = "https://example.com";
    vi.stubGlobal("fetch", async (url: string) => {
      if (url === origin + "/openapi.json") return new Response("", { status: 401 });
      if (url === origin + "/api") return Response.json({ version: "1" }, { headers: { "x-api-version": "1" } });
      return new Response("", { status: 404 });
    });
    const result = await scan(origin, { silent: true });
    assertOk(result);
    const [reach, standards, separation, schema, context] = result.bridges;
    expect(schema).toMatchObject({ score: null, scoreLabel: null, status: "not_evaluated" });
    expect(separation.score).toBeNull();
    expect(context.checks.find(c => c.id === "context_auth_clarity")).toMatchObject({ status: "error" });
    expect(context.checks.find(c => c.id === "context_versioning_signal")).toMatchObject({ status: "pass" });
    expect(result.overallScore).toBe(Math.round((reach.score! + standards.score! + context.score!) / 3));
  });

  it("reports an unmeasured schema after the discovery budget runs out and preserves API explanations", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const report = await scan("https://example.com", { silent: true, maxRequests: 1 });
    assertOk(report);
    expect(report.incomplete).toBe(true);
    expect(report.bridges[3]).toMatchObject({ status: "not_evaluated", score: null, scoreLabel: null, checks: [] });
    expect(report.bridges[4].checks.find(check => check.id === "context_auth_clarity")?.status).toBe("error");
    expect(report.bridges[1].checks.find(check => check.id === "openapi_spec")?.why).toBeTruthy();
  });
});
