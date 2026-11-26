import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpSuccess, HttpFailure } from "../../../core/types.js";

// Mock httpGet before importing the module under test
vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

import { checkDeveloperDocs } from "../developer-docs.js";
import { httpGet } from "../../../utils/http-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccess(url: string, body = ""): HttpSuccess {
  return {
    ok: true,
    url,
    status: 200,
    headers: {},
    body,
    redirects: [],
    durationMs: 10,
  };
}

function makeFailure(url: string): HttpFailure {
  return {
    ok: false,
    error: { kind: "http_error", statusCode: 404, message: "HTTP 404 Not Found", url },
  };
}

function mockAllProbesFail(): void {
  vi.mocked(httpGet).mockImplementation(async (url: string) =>
    makeFailure(url),
  );
}

function mockProbePass(path: string, body = ""): void {
  vi.mocked(httpGet).mockImplementation(async (url: string) => {
    const urlPath = new URL(url).pathname;
    if (urlPath === path) return makeSuccess(url, body);
    return makeFailure(url);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkDeveloperDocs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns id 'developer_docs' and label 'Developer Documentation'", async () => {
    mockAllProbesFail();
    const { check } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(check.id).toBe("developer_docs");
    expect(check.label).toBe("Developer Documentation");
  });

  it("returns pass when /docs probe returns ok:true", async () => {
    mockProbePass("/docs");
    const { check } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(check.status).toBe("pass");
    expect(check.data?.paths).toContain("/docs");
  });

  it("returns pass when /developers probe returns ok:true", async () => {
    mockProbePass("/developers");
    const { check } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(check.status).toBe("pass");
    expect(check.data?.paths).toContain("/developers");
  });

  it("returns pass when /developer probe returns ok:true", async () => {
    mockProbePass("/developer");
    const { check } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(check.status).toBe("pass");
    expect(check.data?.paths).toContain("/developer");
  });

  it("returns pass when /api/docs probe returns ok:true", async () => {
    mockProbePass("/api/docs");
    const { check } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(check.status).toBe("pass");
    expect(check.data?.paths).toContain("/api/docs");
  });

  it("returns pass when /documentation probe returns ok:true", async () => {
    mockProbePass("/documentation");
    const { check } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(check.status).toBe("pass");
    expect(check.data?.paths).toContain("/documentation");
  });

  it("returns pass when all probes fail but HTML contains link to /docs", async () => {
    mockAllProbesFail();
    const html = '<a href="/docs/getting-started">Documentation</a>';
    const { check } = await checkDeveloperDocs(
      "https://example.com",
      html,
      5000,
    );
    expect(check.status).toBe("pass");
    expect(check.data?.paths).toContain("/docs");
  });

  it("returns pass when all probes fail but HTML contains link to /developers", async () => {
    mockAllProbesFail();
    const html = '<a href="/developers/api">Developer Portal</a>';
    const { check } = await checkDeveloperDocs(
      "https://example.com",
      html,
      5000,
    );
    expect(check.status).toBe("pass");
    expect(check.data?.paths).toContain("/developers");
  });

  it("recognizes relative and off-site links by pathname", async () => {
    mockAllProbesFail();
    const html = '<a HREF = developers/start>Dev</a><a class="menu" href="https://help.example.org/en/docs/start">Docs</a>';
    const { check } = await checkDeveloperDocs("https://example.com", html);
    expect(check.data?.paths).toEqual(["/docs", "/developers"]);
    expect(check.data?.linkedUrls).toEqual(["https://example.com/developers/start", "https://help.example.org/en/docs/start"]);
    expect(check.data?.fetchedUrls).toEqual([]);
    expect(check.data?.fetchesComplete).toBe(true);
  });

  it("reports published docs and developer subdomain links even when no guessed docs path resolves", async () => {
    mockAllProbesFail();
    const html = ["docs", "developer", "developers", "docs-other", "support"].map(name =>
      '<a href="https://' + name + '.example.org/#start">Link</a>').join("");
    const { check } = await checkDeveloperDocs("https://example.com", html);
    expect(check.status).toBe("pass");
    expect(check.data).toMatchObject({ paths: [], fetchedUrls: [], linksMeasured: true, fetchesComplete: true,
      linkedUrls: ["https://docs.example.org/", "https://developer.example.org/", "https://developers.example.org/"] });
    expect(vi.mocked(httpGet).mock.calls.some(([url]) => url.includes("example.org"))).toBe(false);
  });

  it.each([{ bodyIncomplete: true as const }, { status: 206 }, { headers: { "content-range": "bytes 0-5/100" } }])(
    "keeps positive observations and marks only the interrupted channel incomplete", async partial => {
      const html = '<a href="/docs">Docs</a>';
      const homepage = makeSuccess("https://example.com", html);
      const docs = makeSuccess("https://example.com/docs", "Documentation");
      mockProbePass("/docs", docs.body);
      const fromHome = await checkDeveloperDocs("https://example.com", html, 1000, { ...homepage, ...partial });
      expect(fromHome.check).toMatchObject({ status: "pass", data: {
        linkedUrls: [docs.url], fetchedUrls: [docs.url], linksMeasured: false, fetchesComplete: true } });
      vi.mocked(httpGet).mockImplementation(async url => url === docs.url ? { ...docs, ...partial } : makeFailure(url));
      const fromDocs = await checkDeveloperDocs("https://example.com", html, 1000, homepage);
      expect(fromDocs.check).toMatchObject({ status: "pass", data: {
        linkedUrls: [docs.url], fetchedUrls: [docs.url], linksMeasured: true, fetchesComplete: false } });
    },
  );

  it("keeps linked routes and successful fetch destinations distinct after redirects", async () => {
    vi.mocked(httpGet).mockImplementation(async (url) => new URL(url).pathname === "/docs"
      ? makeSuccess("https://help.example.org/Docs/index/?token=secret#section")
      : makeFailure(url));
    const html = '<a href="docs/Guide?key=secret#start">Guide</a><a href="https://user:secret@example.org/en/docs">Legacy</a>';
    const { check } = await checkDeveloperDocs("https://example.com", html, 5000, "https://example.org/landing/");
    expect(check.data).toEqual({
      paths: ["/docs"],
      linkedUrls: ["https://example.org/landing/docs/Guide", "https://example.org/en/docs"],
      fetchedUrls: ["https://help.example.org/Docs/index/"],
      linksMeasured: true, fetchesComplete: true,
    });
  });

  it("marks missing homepage evidence and interrupted fetches even when another probe succeeds", async () => {
    vi.mocked(httpGet).mockImplementation(async (url) => new URL(url).pathname === "/docs"
      ? makeSuccess(url)
      : { ok: false, error: { kind: "timeout", message: "Timed out", url } });
    const { check } = await checkDeveloperDocs("https://example.com", "", 5000, null);
    expect(check.status).toBe("pass");
    expect(check.data).toMatchObject({
      linkedUrls: [], fetchedUrls: ["https://example.com/docs"], linksMeasured: false, fetchesComplete: false,
    });
  });

  it("resolves relative anchors against the first HTML base href", async () => {
    mockAllProbesFail();
    const html = '<base target="_blank"><base href="../reference/"><a href="docs/Guide">Guide</a>';
    const result = await checkDeveloperDocs("https://example.com", html, 5000, "https://portal.example.org/en/start/");
    expect(result.check.data?.linkedUrls).toEqual(["https://portal.example.org/en/reference/docs/Guide"]);
  });

  it("ignores doc-like text outside anchor href path segments", async () => {
    mockAllProbesFail();
    const html = [
      '<a href="/docsarchive">Archive</a>',
      '<a data-href="/docs">Label</a>',
      `<a title="see href='/docs'" href="/help">Help</a>`,
      '<a href="/search?next=/docs">Search</a>',
      '<a href="https://docs-archive.example.com/">Home</a>',
    ].join("");
    const { check } = await checkDeveloperDocs("https://example.com", html);
    expect(check.status).toBe("fail");
  });

  it("returns fail when all 5 probes fail and no doc links in HTML", async () => {
    mockAllProbesFail();
    const { check } = await checkDeveloperDocs(
      "https://example.com",
      "<p>No docs</p>",
      5000,
    );
    expect(check.status).toBe("fail");
  });

  it("calls httpGet with maxBodyBytes 1_048_576 and no method:HEAD for all 5 probes", async () => {
    mockAllProbesFail();
    await checkDeveloperDocs("https://example.com", "", 5000);
    const calls = vi.mocked(httpGet).mock.calls;
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call[1]).toEqual(expect.objectContaining({ maxBodyBytes: 1_048_576 }));
      // Should NOT pass method: "HEAD" -- uses default GET
      expect(call[1]).not.toHaveProperty("method");
    }
  });

  it("fires all 5 probes in parallel via Promise.all", async () => {
    // Verify all 5 URLs are probed
    mockAllProbesFail();
    await checkDeveloperDocs("https://example.com", "", 5000);
    const urls = vi.mocked(httpGet).mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://example.com/docs");
    expect(urls).toContain("https://example.com/developers");
    expect(urls).toContain("https://example.com/developer");
    expect(urls).toContain("https://example.com/api/docs");
    expect(urls).toContain("https://example.com/documentation");
  });

  it("returns deduplicated paths from probes and link scanning", async () => {
    // /docs probe succeeds AND HTML has link to /docs
    mockProbePass("/docs");
    const html = '<a href="/docs/guide">Guide</a>';
    const { check } = await checkDeveloperDocs(
      "https://example.com",
      html,
      5000,
    );
    expect(check.status).toBe("pass");
    const paths = check.data?.paths as string[];
    // Should be deduplicated -- only one /docs entry
    expect(paths.filter((p) => p === "/docs")).toHaveLength(1);
  });

  it("passes timeout parameter through to httpGet", async () => {
    mockAllProbesFail();
    await checkDeveloperDocs("https://example.com", "", 3000);
    const calls = vi.mocked(httpGet).mock.calls;
    for (const call of calls) {
      expect(call[1]).toEqual(expect.objectContaining({ timeout: 3000 }));
    }
  });

  // --- Pages content tests ---

  it("returns pages with body content from successful probes", async () => {
    mockProbePass("/docs", "<html>Docs content</html>");
    const { pages } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(pages).toHaveLength(1);
    expect(pages[0].content).toBe("<html>Docs content</html>");
    expect(pages[0].source).toBe("/docs");
  });

  it("returns empty pages when all probes fail", async () => {
    mockAllProbesFail();
    const { pages } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(pages).toHaveLength(0);
  });

  it("returns multiple pages from multiple successful probes", async () => {
    vi.mocked(httpGet).mockImplementation(async (url: string) => {
      const urlPath = new URL(url).pathname;
      if (urlPath === "/docs") return makeSuccess(url, "docs body");
      if (urlPath === "/developers") return makeSuccess(url, "dev body");
      return makeFailure(url);
    });
    const { pages } = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(pages).toHaveLength(2);
    expect(pages[0].source).toBe("/docs");
    expect(pages[0].content).toBe("docs body");
    expect(pages[1].source).toBe("/developers");
    expect(pages[1].content).toBe("dev body");
  });
});

describe("checkDeveloperDocs under request-budget exhaustion", () => {
  const budgetDenied = {
    ok: false as const,
    error: { kind: "request_budget_exhausted" as const, message: "Scan request budget exhausted", url: "https://example.com/docs" },
  };

  it("reports error when all probes were denied and no doc links exist", async () => {
    vi.mocked(httpGet).mockResolvedValue(budgetDenied);
    const result = await checkDeveloperDocs("https://example.com", "<html><body>nothing here</body></html>");
    expect(result.check.status).toBe("error");
    expect(result.pages).toHaveLength(0);
  });

  it("still passes via homepage links when probes were denied", async () => {
    vi.mocked(httpGet).mockResolvedValue(budgetDenied);
    const result = await checkDeveloperDocs("https://example.com", '<a href="/docs">Docs</a>');
    expect(result.check.status).toBe("pass");
  });
});
