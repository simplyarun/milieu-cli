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
    error: { kind: "http_error", message: "HTTP 404 Not Found", url },
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
