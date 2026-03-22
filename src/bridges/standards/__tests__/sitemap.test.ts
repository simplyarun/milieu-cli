import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpSuccess, HttpFailure } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

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
  });

  it("returns Check with id 'sitemap' and label 'XML Sitemap'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkSitemap("https://example.com", []);
    expect(result.check.id).toBe("sitemap");
    expect(result.check.label).toBe("XML Sitemap");
  });

  it("probes /sitemap.xml and /sitemap_index.xml by default", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkSitemap("https://example.com", []);
    expect(mockHttpGet).toHaveBeenCalledTimes(2);
    const urls = mockHttpGet.mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://example.com/sitemap.xml");
    expect(urls).toContain("https://example.com/sitemap_index.xml");
  });

  it("also probes robots.txt sitemap URLs", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkSitemap("https://example.com", [
      "https://example.com/custom-sitemap.xml",
    ]);
    expect(mockHttpGet).toHaveBeenCalledTimes(3);
    const urls = mockHttpGet.mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://example.com/custom-sitemap.xml");
  });

  it("deduplicates probe URLs", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkSitemap("https://example.com", [
      "https://example.com/sitemap.xml", // same as default
    ]);
    expect(mockHttpGet).toHaveBeenCalledTimes(2); // not 3
  });

  it("ignores cross-origin robots.txt sitemap URLs", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkSitemap("https://example.com", [
      "https://other-site.com/sitemap.xml",
    ]);
    expect(mockHttpGet).toHaveBeenCalledTimes(2); // only default paths
  });

  it("returns pass with URL count for valid sitemap", async () => {
    const sitemap = makeSitemap([
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page3",
    ]);
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("pass");
    expect(result.urls).toHaveLength(3);
    expect(result.check.detail).toContain("3 URLs");
  });

  it("returns partial when sitemap exists but has no URLs", async () => {
    const emptySitemap = '<?xml version="1.0"?><urlset></urlset>';
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess(emptySitemap));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("partial");
    expect(result.urls).toHaveLength(0);
  });

  it("returns fail when no sitemap found", async () => {
    mockHttpGet.mockResolvedValue(make404());

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
    mockHttpGet.mockResolvedValueOnce(makeSuccess(index));
    // Only 3 child fetches should happen
    mockHttpGet.mockResolvedValue(
      makeSuccess(makeSitemap(["https://example.com/page"])),
    );

    await checkSitemap("https://example.com", []);
    // 2 initial probes + 3 child fetches = 5
    expect(mockHttpGet).toHaveBeenCalledTimes(5);
  });

  it("filters out cross-origin URLs from sitemap content", async () => {
    const sitemap = makeSitemap([
      "https://example.com/page1",
      "https://evil.com/page2",
    ]);
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap));

    const result = await checkSitemap("https://example.com", []);
    expect(result.urls).toEqual(["https://example.com/page1"]);
  });

  it("ignores non-XML responses", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess("Just plain text, not XML"));

    const result = await checkSitemap("https://example.com", []);
    expect(result.check.status).toBe("fail");
  });

  it("deduplicates URLs across multiple sitemaps", async () => {
    const sitemap1 = makeSitemap(["https://example.com/page1", "https://example.com/page2"]);
    const sitemap2 = makeSitemap(["https://example.com/page2", "https://example.com/page3"]);

    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap1));
    mockHttpGet.mockResolvedValueOnce(makeSuccess(sitemap2));

    const result = await checkSitemap("https://example.com", []);
    expect(result.urls).toHaveLength(3); // deduplicated
  });

  it("passes timeout to httpGet", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkSitemap("https://example.com", [], 5000);

    for (const call of mockHttpGet.mock.calls) {
      expect(call[1]?.timeout).toBe(5000);
    }
  });
});
