import { describe, expect, it } from "vitest";
import { compareReports } from "../diff.js";
import type { BridgeResult, Check, ScanResult } from "../types.js";

const site = "https://api.example.com";
const preview = "https://preview.example.com";

function report(...checks: [number, Check][]): ScanResult {
  const names = ["Reachability", "Standards", "Separation", "Schema", "Context"] as const;
  const bridges = names.map((name, index) => ({
    id: index + 1, name, status: "evaluated", score: index === 2 ? null : 50,
    scoreLabel: index === 2 ? null : "partial", durationMs: 5,
    checks: checks.filter(([id]) => id === index + 1).map(([, check]) => check),
  } as BridgeResult)) as ScanResult["bridges"];
  return { ok: true, url: site, scannedOrigin: site, version: "0.3.2", timestamp: "2026-04-15",
    durationMs: 50, incomplete: false, overallScore: 50, overallScoreLabel: "partial", bridges };
}

function check(id: string, status: Check["status"], data?: Check["data"]): Check {
  return { id, status, data, label: id };
}

function auth(signals: string[], patch: Check["data"] = {}, status: Check["status"] = "partial") {
  return check("context_auth_legibility", status, {
    method: "GET", measurement: "challenged", httpStatus: 401, probeSource: "protected_operation",
    probeUrl: site + "/v1/orders", responseUrl: site + "/v1/orders", signals, ...patch,
  });
}

function docs(linkedUrls: string[], fetchedUrls: string[], patch: Check["data"] = {}) {
  return check("developer_docs", "pass", { linkedUrls, fetchedUrls, linksMeasured: true, fetchesComplete: true, ...patch });
}

function diffAuth(base: Check, head: Check) {
  return compareReports(report([5, base]), report([5, head])).findings;
}

function routeReport(routes: Array<[string, string]>, complete = true, scannedOrigin = site, contract = scannedOrigin + "/openapi.json") {
  const api = check("api_presence", "pass", {
    descriptionSource: contract, routeEvidence: { complete, capabilities: [{
      id: "openapi-description", label: "Discover the OpenAPI contract", routes: routes.map(([source, target]) => ({ source, target })),
    }] },
  });
  const result = report([2, check("openapi_spec", "pass", { documentUrl: contract })], [3, api]);
  result.url = result.scannedOrigin = scannedOrigin;
  return result;
}

describe("offline scan report comparison", () => {
  it("attributes rate-limit changes only to the same measured operation and HTTP status", () => {
    const url = site + "/v1/items";
    function rate(status: Check["status"], patch: Check["data"] = {}) {
      return check("context_rate_limit_headers", status, {
        probeUrl: url, responseUrl: url, method: "GET", probeSource: "operation",
        httpStatus: 200, measurement: "measured", ...patch,
      });
    }
    const base = rate("pass");
    expect(diffAuth(base, rate("fail"))).toMatchObject([{ kind: "regression", target: "GET /v1/items" }]);
    expect(diffAuth(rate("fail"), base)).toMatchObject([{ kind: "improvement" }]);
    for (const head of [rate("fail", { httpStatus: 429 }), rate("fail", { probeSource: "fallback" }),
      rate("fail", { responseHasQuery: true }), rate("pass", { responseUrl: site + "/login" }),
      rate("error", { httpStatus: null, measurement: "unmeasured" }), rate("fail", { responseUrl: undefined }),
      check("context_rate_limit_headers", "fail", { probeUrl: url, headerFound: null })]) {
      expect(diffAuth(base, head)).toMatchObject([{ kind: "inconclusive" }]);
    }
    const localPreview = report([5, rate("fail", { probeUrl: preview + "/v1/items", responseUrl: preview + "/v1/items" })]);
    localPreview.scannedOrigin = preview;
    expect(compareReports(report([5, base]), localPreview, { originMap: { base: site, head: preview } }).findings)
      .toMatchObject([{ kind: "regression", target: "GET /v1/items" }]);
  });

  it("treats fallback authentication, login redirects and changed challenge status as inconclusive", () => {
    for (const probe of [{ probeSource: "fallback" }, { responseUrl: site + "/login" }]) {
      expect(diffAuth(auth(["www-authenticate"], probe), auth([], probe))).toMatchObject([{ kind: "inconclusive" }]);
    }
    expect(diffAuth(auth(["www-authenticate"]), auth([], { httpStatus: 403 }))).toMatchObject([{ kind: "inconclusive" }]);
  });

  it("ignores scores, timestamps, result order, prose and non-semantic data", () => {
    const base = report([1, check("http_status", "pass")], [1, check("https_available", "pass")],
      [5, auth(["www-authenticate", "json_error_body"])], [2, check("sitemap", "pass", { totalUrls: 200 })]);
    const head = structuredClone(base);
    head.bridges[0].checks.reverse();
    head.bridges[1].checks[0].data = { totalUrls: 1000 };
    head.bridges[4].checks[0].data!.signals = ["json_error_body", "www-authenticate"];
    head.timestamp = "another time";
    head.overallScore = 20;
    head.bridges[0].durationMs = 200;
    head.bridges[0].checks[0].detail = "A different explanation";
    expect(compareReports(base, head).findings).toEqual([]);
  });

  it("requires the same scanner version and an exact ordered preview pair", () => {
    const base = report();
    const head = report();
    head.version = "0.3.3";
    expect(() => compareReports(base, head)).toThrow(/version/i);
    head.version = base.version;
    head.scannedOrigin = preview;
    expect(() => compareReports(base, head)).toThrow(/origin/i);
    const compare = (a: string, b: string) => compareReports(base, head, { originMap: { base: a, head: b } });
    expect(() => compare(preview, site)).toThrow(/origin/i);
    expect(() => compare(site, preview + "/path")).toThrow(/origin/i);
    expect(() => compare(site, preview + "?branch=123")).toThrow(/origin/i);
    expect(() => compare(site, preview + "/hidden/..")).toThrow(/origin/i);
    expect(compare(site + "/", preview).findings).toEqual([]);
  });

  it("matches check IDs independently in each bridge and separates inventory", () => {
    const base = report([1, check("shared", "pass")], [3, check("shared", "fail")], [2, check("llms_txt", "partial")],
      [1, check("http_status", "pass")], [3, docs([], [])]);
    const head = report([1, check("shared", "fail", { policy: "fail" })], [2, check("llms_txt", "pass")], [3, check("shared", "pass")],
      [1, check("http_status", "pass")], [3, docs([], [])]);
    expect(compareReports(base, head).findings.map(f => [f.bridgeId, f.kind])).toEqual([
      [1, "regression"], [2, "improvement"], [3, "inventory"],
    ]);
  });

  it("shows losses and gains in measured auth guidance on an unchanged grade", () => {
    const rich = auth(["json_error_body", "www-authenticate"]);
    const reduced = auth(["json_error_body"]);
    expect(diffAuth(rich, reduced)).toMatchObject([{ kind: "regression", target: "GET /v1/orders", bridgeId: 5,
      checkId: "context_auth_legibility", before: "HTTP 401 · protected GET /v1/orders · WWW-Authenticate, JSON error body",
      after: expect.stringContaining("HTTP 401"), verification: expect.stringContaining("unauthenticated GET") }]);
    expect(diffAuth(reduced, rich)).toMatchObject([{ kind: "improvement" }]);
    expect(diffAuth(auth(["www-authenticate"]), auth(["json_error_body"]))).toMatchObject([{ kind: "inconclusive" }]);
    expect(diffAuth(rich, auth(["www-authenticate", "json_error_body"], { httpStatus: 403 })))
      .toMatchObject([{ kind: "inconclusive", before: expect.stringContaining("401"), after: expect.stringContaining("403") }]);
  });

  it("distinguishes a previously measured challenge from an unmeasured or different target", () => {
    const a = auth(["json_error_body"]);
    const attempts = [
      auth([], { httpStatus: null, measurement: "unmeasured" }, "fail"),
      auth(["no_auth_required"], { httpStatus: 200, measurement: "no_challenge" }),
      auth([], { probeSource: "fallback" }, "fail"),
      auth([], { probeUrl: site + "/different" }, "fail"),
      auth([], { probeUrl: "https://other.example.org/v1/orders" }, "fail"),
      auth([], { responseUrl: "https://gateway.example.org/v1/orders" }, "fail"),
      auth([], { responseHasQuery: true }, "fail"),
      auth([], { responseUrl: undefined }, "fail"),
      check("context_auth_legibility", "fail", { probeUrl: site + "/v1/orders", signals: [] }),
    ];
    for (const b of attempts) expect(diffAuth(a, b)).toMatchObject([{ kind: "inconclusive" }]);
  });

  it("maps preview-local auth and docs URLs but preserves off-origin URL identity", () => {
    const a = report([5, auth(["json_error_body"])], [3, docs([site + "/docs", "https://docs.one/guide"], [])]);
    const b = report([5, auth(["json_error_body"], { probeUrl: preview + "/v1/orders", responseUrl: preview + "/v1/orders" })],
      [3, docs([preview + "/docs", "https://docs.two/guide"], [])]);
    b.scannedOrigin = preview;
    expect(compareReports(a, b, { originMap: { base: site, head: preview } }).findings).toMatchObject([
      { kind: "inventory", target: "https://docs.one/guide", before: "linked", after: "not linked" },
      { kind: "inventory", target: "https://docs.two/guide", before: "not linked", after: "linked" },
    ]);
  });

  it("distinguishes exact documentation links from final URLs fetched", () => {
    const url = site + "/Team/Developers";
    const a = report([3, docs([url], [])]);
    const b = report([3, docs([], [url])]);
    expect(compareReports(a, b).findings).toMatchObject([
      { checkId: "developer_docs", kind: "inventory", before: "linked", after: "not linked", target: "/Team/Developers" },
      { checkId: "developer_docs", kind: "inventory", before: "not fetched", after: "fetched", target: "/Team/Developers" },
    ]);
  });

  it("treats missing documentation coverage and legacy path-only evidence conservatively", () => {
    const url = site + "/docs";
    const a = report([3, docs([url], [url])]);
    const b = report([3, docs([], [], { linksMeasured: false, fetchesComplete: false })]);
    expect(compareReports(a, b).findings.map(f => f.kind)).toEqual(["inconclusive", "inconclusive"]);
    // A failed fetch does not hide the result of an independent, successful homepage read.
    const partial = docs([], [], { linksMeasured: true, fetchesComplete: false });
    partial.status = "error";
    expect(compareReports(a, report([3, partial])).findings.map(f => f.kind)).toEqual(["inventory", "inconclusive"]);
    const old = report([3, check("developer_docs", "pass", { paths: ["/docs"] })]);
    expect(compareReports(old, a).findings.map(f => f.kind)).toEqual(["inconclusive"]);
    expect(compareReports(old, old).findings).toEqual([]);
    const renamed = report([3, check("developer_docs", "pass", { paths: ["/developer"] })]);
    expect(compareReports(old, renamed).findings.map(f => f.kind)).toEqual(["inconclusive"]);
  });

  it("requires evidence of a negative response before calling a soft probe failure a regression", () => {
    const a = report([1, check("http_status", "pass")], [2, check("llms_txt", "pass")]);
    const b = report([1, { ...check("http_status", "fail"), detail: "Request timed out" }],
      [2, { ...check("llms_txt", "fail"), detail: "No llms.txt found" }]);
    expect(compareReports(a, b).findings.map(f => f.kind)).toEqual(["inconclusive", "inconclusive"]);
    b.bridges[0].checks[0].data = { statusCode: 503 };
    b.bridges[1].checks[0].detail = "No llms.txt found (HTML response)";
    expect(compareReports(a, b).findings.map(f => f.kind)).toEqual(["regression", "regression"]);
    b.incomplete = true;
    expect(compareReports(a, b).findings.map(f => f.kind)).toEqual(["regression", "regression"]);
  });

  it("reports absent checks, skipped bridges, and exhausted budget as inconclusive", () => {
    const a = report([1, check("https_available", "pass")], [2, check("sitemap", "pass")],
      [3, check("api_presence", "pass")], [5, check("context_agents_json", "pass")]);
    const b = report([1, check("https_available", "error")], [5, check("context_agents_json", "fail")]);
    b.incomplete = true;
    b.bridges[1].status = "not_evaluated";
    const diff = compareReports(a, b);
    expect(diff.headIncomplete).toBe(true);
    expect(diff.findings.map(f => [f.bridgeId, f.checkId, f.kind])).toEqual([
      [1, "https_available", "inconclusive"], [2, null, "inconclusive"], [3, "api_presence", "inconclusive"],
      [5, "context_agents_json", "inconclusive"],
    ]);
    expect(compareReports(b, b).findings).toEqual([]);
  });

  it("groups schema results masked by unavailable spec inputs; runtime auth evidence still compares", () => {
    const a = report([2, check("openapi_spec", "pass", { path: "/api.json", documentUrl: site + "/api.json" })], [4, check("schema_operation_ids", "pass")],
      [4, check("schema_error_responses", "pass")], [5, auth(["www-authenticate"])]);
    for (const unavailable of [check("openapi_spec", "error"), check("openapi_spec", "fail"),
      check("openapi_spec", "partial", { protected: true, path: "/api.json" }),
      check("openapi_spec", "partial", { registry: "apis.guru", specUrl: "https://registry.example/spec" })]) {
      const b = report([2, unavailable], [4, check("schema_operation_ids", "fail")], [4, check("schema_error_responses", "fail")], [5, auth([], {}, "fail")]);
      expect(compareReports(a, b).findings.filter(f => f.bridgeId === 4)).toMatchObject([{ kind: "inconclusive", checkId: null }]);
      expect(compareReports(a, b).findings.filter(f => f.bridgeId === 5)).toMatchObject([{ kind: "regression" }]);
    }
  });

  it("compares schema check status only when both scans read the same spec path", () => {
    const scan = (path: string, quality: Check["status"], data: Check["data"] = {}) =>
      report([2, check("openapi_spec", "pass", { path, documentUrl: site + path, ...data })], [4, check("schema_operation_ids", quality)]);
    expect(compareReports(scan("/a.json", "pass"), scan("/b.json", "fail")).findings)
      .toMatchObject([{ kind: "inconclusive", checkId: null }]);
    expect(compareReports(scan("/a.json", "pass"), scan("/a.json", "fail")).findings)
      .toMatchObject([{ kind: "regression", checkId: "schema_operation_ids" }]);
    for (const data of [{ documentUrl: "https://external.example/a.json" }, { documentHasQuery: true }, { documentUrl: undefined }]) {
      expect(compareReports(scan("/a.json", "pass"), scan("/a.json", "fail", data)).findings)
        .toMatchObject([{ kind: "inconclusive", checkId: null }]);
    }
    expect(compareReports(scan("/a.json", "pass", { documentUrl: undefined }), scan("/a.json", "fail", { documentUrl: undefined })).findings)
      .toMatchObject([{ kind: "inconclusive", checkId: null }]);
    const old = scan("/a.json", "pass", { documentUrl: undefined });
    const candidate = structuredClone(old);
    old.bridges[4].checks.push(check("context_tos_url", "pass", { source: "spec" }));
    candidate.bridges[4].checks.push(check("context_tos_url", "partial", { source: "page" }));
    expect(compareReports(old, candidate).findings).toMatchObject([{ kind: "inconclusive", checkId: "context_tos_url" }]);
  });

  it("keeps SDK inventory differences inconclusive when any searched source was unreadable", () => {
    const scan = (sdk: Check, homepage: Check, llms: Check, docsEvidence: Check) =>
      report([3, sdk], [1, homepage], [2, llms], [3, docsEvidence]);
    const page = check("http_status", "pass");
    const llms = check("llms_txt", "pass");
    const doc = docs([site + "/docs"], [site + "/docs"]);
    const a = scan(check("sdk_references", "pass", { sources: ["/docs"], registries: ["npm"] }), page, llms, doc);
    const missing = check("sdk_references", "fail");
    for (const b of [scan(missing, check("http_status", "fail"), llms, doc),
      scan(missing, page, check("llms_txt", "error"), doc), scan(missing, page, llms, docs([site + "/docs"], [], { fetchesComplete: false }))]) {
      expect(compareReports(a, b).findings.find(f => f.checkId === missing.id)?.kind).toBe("inconclusive");
    }
    expect(compareReports(a, scan(missing, page, llms, doc)).findings).toMatchObject([{ kind: "inventory" }]);
  });

  it("detects the last published route to a still-verified contract disappearing, with unchanged bridge scores", () => {
    const base = routeReport([[site + "/docs", site + "/openapi.json"]]);
    const head = routeReport([]);
    expect(compareReports(base, head).findings).toMatchObject([{
      kind: "regression", bridgeId: 3, checkId: "api_presence", capabilityId: "openapi-description",
      before: expect.stringContaining("/docs → /openapi.json"),
      after: expect.stringContaining("No route observed in the checked entry pages"),
      verification: expect.stringContaining("published link"),
    }]);
    expect(compareReports(head, base).findings).toMatchObject([{ kind: "improvement", bridgeId: 3 }]);
    expect(head.bridges[2].score).toBeNull();
  });

  it("reports inventory when a usable alternative remains or an equivalent route replaces the old one", () => {
    const base = routeReport([[site + "/", site + "/openapi.json"], [site + "/docs", site + "/openapi.json"]]);
    const remaining = routeReport([[site + "/docs", site + "/openapi.json"]]);
    const replaced = routeReport([[site + "/developers", site + "/api-description"]]);
    expect(compareReports(base, remaining).findings).toMatchObject([{ kind: "inventory" }]);
    expect(compareReports(remaining, replaced).findings).toMatchObject([{ kind: "inventory",
      before: expect.stringContaining("/docs → /openapi.json"), after: expect.stringContaining("/developers → /api-description") }]);
    // The presence of SDK evidence is independent of the published API-contract routes.
    for (const r of [base, remaining]) {
      r.bridges[0].checks.push(check("http_status", "pass"));
      r.bridges[1].checks.push(check("llms_txt", "pass"));
      r.bridges[2].checks.push(docs([], []));
    }
    base.bridges[2].checks.push(check("sdk_references", "pass"));
    remaining.bridges[2].checks.push(check("sdk_references", "fail"));
    expect(compareReports(base, remaining).findings.map(f => f.kind)).toEqual(["inventory", "inventory"]);
  });

  it("preserves the scope of route coverage, independently of unrelated probes and legacy reports", () => {
    const base = routeReport([[site + "/", site + "/openapi.json"]]);
    const complete = routeReport([]);
    complete.incomplete = true; // a different probe exhausted the budget
    expect(compareReports(base, complete).findings).toMatchObject([{ kind: "regression" }]);
    expect(compareReports(base, routeReport([], false)).findings).toMatchObject([{ kind: "inconclusive" }]);
    expect(compareReports(routeReport([[site + "/", site + "/openapi.json"]], false), complete).findings)
      .toMatchObject([{ kind: "inconclusive" }]);
    const old = routeReport([]);
    delete old.bridges[2].checks[0].data!.routeEvidence;
    expect(compareReports(base, old).findings).toMatchObject([{ kind: "inconclusive" }]);
    expect(compareReports(old, old).findings).toEqual([]);
  });

  it("requires independent confirmation of the same final document identity", () => {
    const base = routeReport([[site + "/", site + "/openapi.json"]]);
    const cases = [routeReport([]), routeReport([]), routeReport([]), routeReport([])];
    cases[0].bridges[2].checks[0].data!.routeEvidence = { capabilities: [], complete: true };
    cases[1].bridges[1].checks[0].status = "partial"; // registry-only detection
    cases[2].bridges[1].checks[0].data!.documentHasQuery = true;
    cases[3].bridges[2].checks[0].data!.descriptionSource = "https://external.example/openapi.json";
    for (const candidate of cases) {
      expect(compareReports(base, candidate).findings.filter(f => f.capabilityId)).toMatchObject([{ kind: "inconclusive" }]);
    }
  });

  it("matches equivalent preview origins, preserves external identities, and ignores ordering and duplicate links", () => {
    const external = "https://docs.external.example/reference";
    const base = routeReport([[site + "/", site + "/openapi.json"], [external, site + "/openapi.json"]]);
    const head = routeReport([[external, preview + "/openapi.json"], [preview + "/", preview + "/openapi.json"],
      [preview + "/", preview + "/openapi.json"]], true, preview);
    const options = { originMap: { base: site, head: preview } };
    expect(compareReports(base, head, options).findings).toEqual([]);
    const other = routeReport([], true, preview, "https://different.example/openapi.json");
    expect(compareReports(base, other, options).findings.filter(f => f.capabilityId)).toMatchObject([{ kind: "inconclusive" }]);
  });

  it("never exposes credentials or query values from malformed route evidence", () => {
    const base = routeReport([[site + "/docs", site + "/openapi.json"]]);
    for (const url of [site + "/docs?token=SENSITIVE", "https://user:SENSITIVE@api.example.com", "file:///SENSITIVE"]) {
      const head = routeReport([[url, site + "/openapi.json"]]);
      const findings = compareReports(base, head).findings;
      expect(findings).toMatchObject([{ kind: "inconclusive" }]);
      expect(JSON.stringify(findings)).not.toContain("SENSITIVE");
    }
  });

  it("keeps comparable package links as inventory and preserves registry origins across preview mappings", () => {
    const one = "https://www.npmjs.com/package/tool-one";
    const two = "https://www.npmjs.com/package/tool-two";
    const sdk = (packageLinks: string[], pages: string[], complete = true) =>
      check("sdk_references", "pass", { registries: ["npm"], packageLinks, packageLinkPages: pages, packageLinksComplete: complete });
    const base = report([3, sdk([one, two], [site + "/", site + "/docs"])]);
    const head = report([3, sdk([two], [preview + "/docs", preview + "/"])]);
    head.scannedOrigin = preview;
    const mapped = { originMap: { base: site, head: preview } };
    expect(compareReports(base, head, mapped).findings).toMatchObject([{ kind: "inventory", target: one }]);
    for (const candidate of [sdk([two], [preview + "/", "https://external.example/docs"]),
      sdk([two], [preview + "/", preview + "/docs"], false), check("sdk_references", "pass", { registries: ["npm"] })]) {
      head.bridges[2].checks[0] = candidate;
      expect(compareReports(base, head, mapped).findings).toMatchObject([{ kind: "inconclusive" }]);
    }
  });

  it("distinguishes a surviving catalog route from a catalog that was not reobserved", () => {
    const catalog: [string, string] = [site + "/.well-known/api-catalog", site + "/openapi.json"];
    const home: [string, string] = [site + "/", site + "/openapi.json"];
    const catalogScan = (routes: Array<[string, string]>) => {
      const result = routeReport(routes);
      Object.assign(result.bridges[2].checks[0].data!.routeEvidence as object, { catalogVerified: true });
      return result;
    };
    const both = catalogScan([home, catalog]);
    const catalogOnly = catalogScan([catalog]);
    expect(compareReports(both, catalogOnly).findings).toMatchObject([{ kind: "inventory" }]);
    expect(compareReports(catalogOnly, routeReport([])).findings).toMatchObject([{ kind: "inconclusive" }]);
    expect(compareReports(routeReport([]), catalogOnly).findings).toMatchObject([{ kind: "inconclusive" }]);
  });
});
