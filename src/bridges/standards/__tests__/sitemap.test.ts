import { gzipSync } from "node:zlib";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpSuccess, HttpFailure } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

// Mock global fetch for .gz requests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { checkSitemap } from "../sitemap.js";
import { httpGet } from "../../../utils/http-client.js";

const mockHttpGet = vi.mocked(httpGet);

// --- Helpers ---

function makeSuccess(body: string, overrides: Partial<HttpSuccess> = {}): HttpSuccess {
  return {
    ok: true,
    url: "https://example.com/sitemap.xml",
    status: 200,
    headers: { "content-type": "application/xml" },
    body,
    redirects: [],
    durationMs: 50,
    ...overrides,
  };
}

function make404(): HttpFailure {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404", statusCode: 404, url: "https://example.com/sitemap.xml" },
  };
}

function makeSitemap(urls: string[]): string {
  const locs = urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n");
  return `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs}\n</urlset>`;
}

function makeSitemapIndex(sitemapUrls: string[]): string {
  const locs = sitemapUrls.map((u) => `  <sitemap><loc>${u}</loc></sitemap>`).join("\n");
  return `<?xml version="1.0"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs}\n</sitemapindex>`;
}

// --- Tests ---

describe("checkSitemap", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
    mockFetch.mockReset();
  });

  it("returns Check with id 'sitemap' and label 'XML Sitemap'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    const result = await checkSitemap("https://example.com", []);
    expect(result.check.id).toBe("sitemap");
    expect(result.check.label).toBe("XML Sitemap");
  });

  it("probes /sitemap.xml, /sitemap_index.xml, and /sitemap.xml.gz by default", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await checkSitemap("https://example.com", []);
    // httpGet called for non-.gz paths, fetch called for .gz path
    expect(mockHttpGet).toHaveBeenCalledTimes(2);
    const urls = mockHttpGet.mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://example.com/sitemap.xml");
    expect(urls).toContain("https://example.com/sitemap_index.xml");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/sitemap.xml.gz");
  });

  it("also probes robots.txt sitemap URLs", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await checkSitemap("https://example.com", [
      "https://example.com/custom-sitemap.xml",
    ]);
    // 3 non-.gz probes via httpGet + 1 .gz probe via fetch
    expect(mockHttpGet).toHaveBeenCalledTimes(3);
    const urls = mockHttpGet.mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://example.com/custom-sitemap.xml");
  });

  it("deduplicates probe URLs", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await checkSitemap("https://example.com", [
      "https://example.com/sitemap.xml", // same as default
    ]);
    expect(mockHttpGet).toHaveBeenCalledTimes(2); // not 3 — deduplicated
  });

  it("ignores cross-origin robots.txt sitemap URLs", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await checkSitemap("https://example.com", [
      "https://other-site.com/sitemap.xml",
    ]);
    expect(mockHttpGet).toHaveBeenCalledTimes(2); // only default non-.gz paths
  });

  it("returns pass with URL count for valid sitemap", async () => {
    const sitemap = makeSitemap([
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page3",
    ]);
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("pass");
    expect(result.urls).toHaveLength(3);
    expect(result.check.detail).toContain("3 URLs");
  });

  it("returns partial when sitemap exists but has no URLs", async () => {
    const emptySitemap = '<?xml version="1.0"?><urlset></urlset>';
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(emptySitemap));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("partial");
    expect(result.urls).toHaveLength(0);
  });

  it("returns fail when no sitemap found", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("fail");
    expect(result.urls).toHaveLength(0);
    expect(result.apiRelevantUrls).toHaveLength(0);
  });

  it("filters API-relevant URLs from sitemap", async () => {
    const sitemap = makeSitemap([
      "https://example.com/page1",
      "https://example.com/openapi.json",
      "https://example.com/api/v2/docs",
      "https://example.com/about",
      "https://example.com/graphql",
    ]);
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap));

    const result = await checkSitemap("https://example.com", []);
    expect(result.apiRelevantUrls).toContain("https://example.com/openapi.json");
    expect(result.apiRelevantUrls).toContain("https://example.com/api/v2/docs");
    expect(result.apiRelevantUrls).toContain("https://example.com/graphql");
    expect(result.apiRelevantUrls).not.toContain("https://example.com/page1");
    expect(result.check.detail).toContain("3 API-relevant");
  });

  it("follows sitemap index to child sitemaps", async () => {
    const index = makeSitemapIndex([
      "https://example.com/sitemap-pages.xml",
      "https://example.com/sitemap-api.xml",
    ]);
    const childSitemap = makeSitemap([
      "https://example.com/api/v1/users",
      "https://example.com/api/v1/orders",
    ]);

    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(index));
    // Child sitemap fetches
    mockHttpGet.mockResolvedValueOnce(makeSuccess(childSitemap));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(childSitemap));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("pass");
    // 2 child sitemaps * 2 URLs each = 4, but deduplicated = 2
    expect(result.urls).toHaveLength(2);
  });

  it("limits child sitemaps to 3", async () => {
    const index = makeSitemapIndex([
      "https://example.com/sitemap-1.xml",
      "https://example.com/sitemap-2.xml",
      "https://example.com/sitemap-3.xml",
      "https://example.com/sitemap-4.xml", // should be ignored
      "https://example.com/sitemap-5.xml", // should be ignored
    ]);

    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(index));
    // Only 3 child fetches should happen
    mockHttpGet.mockResolvedValue(
      makeSuccess(makeSitemap(["https://example.com/page"])),
    );

    await checkSitemap("https://example.com", []);
    // 2 initial non-.gz probes + 3 child fetches = 5 via httpGet
    // 1 .gz probe via fetch
    expect(mockHttpGet).toHaveBeenCalledTimes(5);
  });

  it("filters out cross-origin URLs from sitemap content", async () => {
    const sitemap = makeSitemap([
      "https://example.com/page1",
      "https://evil.com/page2",
    ]);
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap));

    const result = await checkSitemap("https://example.com", []);
    expect(result.urls).toEqual(["https://example.com/page1"]);
  });

  it("ignores non-XML responses", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess("Just plain text, not XML"));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("fail");
  });

  it("deduplicates URLs across multiple sitemaps", async () => {
    const sitemap1 = makeSitemap(["https://example.com/page1", "https://example.com/page2"]);
    const sitemap2 = makeSitemap(["https://example.com/page2", "https://example.com/page3"]);

    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap1));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap2));

    const result = await checkSitemap("https://example.com", []);
    expect(result.urls).toHaveLength(3); // deduplicated
  });

  it("passes timeout to httpGet", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await checkSitemap("https://example.com", [], 5000);

    for (const call of mockHttpGet.mock.calls) {
      expect(call[1]?.timeout).toBe(5000);
    }
  });

  // --- .gz support ---

  it("decompresses .gz sitemap probed at /sitemap.xml.gz", async () => {
    const sitemap = makeSitemap([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
    const gzipped = gzipSync(Buffer.from(sitemap, "utf-8"));

    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(
      new Response(gzipped, { status: 200, headers: { "content-type": "application/gzip" } }),
    );

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("pass");
    expect(result.urls).toHaveLength(2);
    expect(result.urls).toContain("https://example.com/page1");
  });

  it("follows .gz child sitemaps from a sitemap index", async () => {
    const index = makeSitemapIndex([
      "https://example.com/sitemap-0.xml.gz",
    ]);
    const childSitemap = makeSitemap([
      "https://example.com/api/v1/users",
      "https://example.com/docs",
    ]);
    const gzippedChild = gzipSync(Buffer.from(childSitemap, "utf-8"));

    // Initial probes: /sitemap.xml returns the index, others 404
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess(index));
    // .gz probe returns 404
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    // Child .gz fetch returns gzipped sitemap
    mockFetch.mockResolvedValueOnce(
      new Response(gzippedChild, { status: 200, headers: { "content-type": "application/gzip" } }),
    );

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("pass");
    expect(result.urls).toHaveLength(2);
    expect(result.urls).toContain("https://example.com/api/v1/users");
  });

  it("handles robots.txt referencing a .gz sitemap", async () => {
    const sitemap = makeSitemap([
      "https://example.com/page1",
    ]);
    const gzipped = gzipSync(Buffer.from(sitemap, "utf-8"));

    mockHttpGet.mockResolvedValue(make404());
    // .gz probes: first is the default /sitemap.xml.gz (404), second is the robots.txt one (success)
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    mockFetch.mockResolvedValueOnce(
      new Response(gzipped, { status: 200, headers: { "content-type": "application/gzip" } }),
    );

    const result = await checkSitemap("https://example.com", [
      "https://example.com/custom-sitemap.xml.gz",
    ]);
    expect(result.check.status).toBe("pass");
    expect(result.urls).toContain("https://example.com/page1");
  });

  // --- Improved diagnostic messages ---

  it("reports child fetch failures when sitemap index children fail", async () => {
    const index = makeSitemapIndex([
      "https://example.com/sitemap-0.xml",
    ]);

    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(index));
    // Child sitemap fetch fails
    mockHttpGet.mockResolvedValueOnce(make404());

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("partial");
    expect(result.check.detail).toContain("child sitemap");
    expect(result.check.detail).toContain("failed to fetch");
  });

  it("reports when sitemap index references no children", async () => {
    const emptyIndex = '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>';

    mockHttpGet.mockResolvedValue(make404());
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(emptyIndex));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("partial");
    expect(result.check.detail).toContain("references no child sitemaps");
  });
});
