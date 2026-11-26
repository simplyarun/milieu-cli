import { describe, expect, it } from "vitest";
import type { Check, HttpResponse, HttpSuccess } from "../../../core/types.js";
import { contractRoutes, htmlLinks, linkedDocWasFetched } from "../published-routes.js";

const origin = "https://example.com";
const endpoint = origin + "/definitions/v1";
const contract: Check = { id: "openapi_spec", label: "OpenAPI", status: "pass", data: { documentUrl: endpoint } };
const anchor = (href: string) => '<a href="' + href + '">link</a>';
const page = (url: string, body: string): HttpSuccess => ({
  ok: true, status: 200, url, redirects: [], headers: { "content-type": "text/html" }, body, durationMs: 1,
});

function observe(home: HttpSuccess, docs: HttpResponse[], check = contract, targets = [endpoint]) {
  const sources = { homeLinks: htmlLinks(home.body, home.url),
    docs: docs.map(response => ({ requestedUrl: origin + "/docs", response })) };
  return contractRoutes(check, targets, home, sources);
}

describe("published routes to a validated API description", () => {
  it("reports only observed entries and loses both links even when the spec and docs still resolve", () => {
    const docs = page(origin + "/docs", anchor(endpoint));
    const home = page(origin + "/", anchor("/docs") + anchor(endpoint + "#schemas"));
    const first = observe(home, [docs]);
    expect(first).toEqual({ complete: true, catalogVerified: false, capabilities: [{
      id: "openapi-description", label: "Discover the OpenAPI contract", routes: [
        { source: origin + "/", target: endpoint }, { source: origin + "/docs", target: endpoint },
      ],
    }] });
    expect(observe(page(home.url, anchor("/docs")), [docs]).capabilities[0].routes).toEqual([
      { source: docs.url, target: endpoint },
    ]);
    expect(observe(page(home.url, "OpenAPI and SDK available"), [docs])).toEqual({
      complete: true, catalogVerified: false, capabilities: [{ ...first.capabilities[0], routes: [] }],
    });
  });

  it("uses the response URL, first HTML base and entities, and ignores inert markup", () => {
    const doc = page("https://docs.example.org/v1/index", '<base href="https://example.com/definitions/">' +
      '<!-- <a href="/fake-comment"> --><script>\'<a href="/fake-script">\'</script>' +
      '<template><a href="/fake-template">x</a></template><a href="v&#49;">contract</a>');
    doc.redirects = [origin + "/docs"];
    const home = page(origin + "/", anchor("/docs"));
    expect(htmlLinks(doc.body, doc.url).map(url => url.href)).toEqual([endpoint]);
    const found = observe(home, [doc]);
    expect(found.capabilities[0].routes).toEqual([{ source: doc.url, target: endpoint }]);
    expect(linkedDocWasFetched({ homeLinks: htmlLinks(home.body, home.url),
      docs: [{ requestedUrl: origin + "/docs", response: doc }] }, home)).toBe(true);
  });

  it("recognizes only verified redirect aliases and treats redacted selections as ambiguous", () => {
    const home = page(origin + "/", anchor("/spec-link") + anchor("/docs?token=private") + anchor(endpoint + "?token=private"));
    const result = observe(home, [page(origin + "/docs", anchor(endpoint))], contract, [endpoint, origin + "/spec-link"]);
    expect(result.complete).toBe(false);
    expect(result.capabilities[0].routes).toEqual([{ source: home.url, target: origin + "/spec-link" }]);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(observe(home, [], { ...contract, data: { documentUrl: endpoint, documentHasQuery: true } }).capabilities).toEqual([]);
  });

  it("marks uninspected docs and truncated or timed-out sources inconclusive; a confirmed 404 is measured", () => {
    const home = page(origin + "/", anchor("/docs"));
    const docs = page(origin + "/docs", anchor(endpoint));
    expect(observe(home, [{ ...docs, bodyIncomplete: true }]).complete).toBe(false);
    expect(observe({ ...home, bodyIncomplete: true }, [docs]).complete).toBe(false);
    expect(observe(page(home.url, anchor("/docs/unchecked")), [docs]).complete).toBe(false);
    const failure = { ok: false as const, error: { kind: "timeout" as const, message: "timeout", url: docs.url } };
    expect(observe(home, [failure]).complete).toBe(false);
    expect(observe(home, [{ ok: false, error: { kind: "http_error", message: "gone", url: docs.url, statusCode: 404 } }]).complete).toBe(true);
  });

  it("keeps a positively verified catalog alternative after home and docs links disappear", () => {
    const catalogRoute = { source: origin + "/.well-known/api-catalog", target: origin + "/published-spec" };
    const catalog = { ...contract, data: { ...contract.data, source: "api-catalog", catalogRoute } };
    const current = observe(page(origin + "/", ""), [], catalog, [endpoint, catalogRoute.target]);
    expect(current.catalogVerified).toBe(true);
    expect(current.capabilities[0].routes).toEqual([catalogRoute]);
    const unknown = observe(page(origin + "/", ""), []);
    expect(unknown.catalogVerified).toBe(false);
    expect(unknown.capabilities[0].routes).toEqual([]);
  });

  it("excludes asset links, home redirects, and partial representations from docs evidence", () => {
    const home = page(origin + "/", anchor("/") + anchor("/download"));
    const asset = page(origin + "/download", anchor(endpoint));
    const returnedHome = { ...home, redirects: [origin + "/docs"] };
    for (const doc of [asset, returnedHome]) {
      const sources = { homeLinks: htmlLinks(home.body, home.url),
        docs: [{ requestedUrl: origin + "/docs", response: doc }] };
      expect(linkedDocWasFetched(sources, home)).toBe(false);
      expect(observe(home, [doc]).capabilities[0].routes).toEqual([]);
    }
    const linked = page(home.url, anchor("/docs"));
    for (const partial of [{ ...asset, status: 206 }, { ...asset, headers: { ...asset.headers, "content-range": "bytes 0-4/100" } }]) {
      const sources = { homeLinks: htmlLinks(linked.body, linked.url),
        docs: [{ requestedUrl: origin + "/docs", response: partial }] };
      expect(linkedDocWasFetched(sources, linked)).toBe(false);
      expect(observe(linked, [partial]).complete).toBe(false);
    }
  });

  it("keeps an unverified advertised spec as a hint and recognizes query-free external entry pages", () => {
    const home = page(origin + "/", anchor(endpoint) + anchor("https://developers.example.org/"));
    const result = observe(home, [], { ...contract, status: "partial" });
    expect(result).toEqual({ complete: false, catalogVerified: false, capabilities: [] });
    expect(observe(home, []).complete).toBe(false);
  });
});
