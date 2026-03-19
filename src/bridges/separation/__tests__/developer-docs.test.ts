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

function makeSuccess(url: string): HttpSuccess {
  return {
    ok: true,
    url,
    status: 200,
    headers: {},
    body: "",
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

function mockProbePass(path: string): void {
  vi.mocked(httpGet).mockImplementation(async (url: string) => {
    if (url.endsWith(path)) return makeSuccess(url);
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
    const result = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(result.id).toBe("developer_docs");
    expect(result.label).toBe("Developer Documentation");
  });

  it("returns pass when /docs probe returns ok:true", async () => {
    mockProbePass("/docs");
    const result = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(result.status).toBe("pass");
    expect(result.data?.paths).toContain("/docs");
  });

  it("returns pass when /developers probe returns ok:true", async () => {
    mockProbePass("/developers");
    const result = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(result.status).toBe("pass");
    expect(result.data?.paths).toContain("/developers");
  });

  it("returns pass when /developer probe returns ok:true", async () => {
    mockProbePass("/developer");
    const result = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(result.status).toBe("pass");
    expect(result.data?.paths).toContain("/developer");
  });

  it("returns pass when /api/docs probe returns ok:true", async () => {
    mockProbePass("/api/docs");
    const result = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(result.status).toBe("pass");
    expect(result.data?.paths).toContain("/api/docs");
  });

  it("returns pass when /documentation probe returns ok:true", async () => {
    mockProbePass("/documentation");
    const result = await checkDeveloperDocs("https://example.com", "", 5000);
    expect(result.status).toBe("pass");
    expect(result.data?.paths).toContain("/documentation");
  });

  it("returns pass when all probes fail but HTML contains link to /docs", async () => {
    mockAllProbesFail();
    const html = '<a href="/docs/getting-started">Documentation</a>';
    const result = await checkDeveloperDocs(
      "https://example.com",
      html,
      5000,
    );
    expect(result.status).toBe("pass");
    expect(result.data?.paths).toContain("/docs");
  });

  it("returns pass when all probes fail but HTML contains link to /developers", async () => {
    mockAllProbesFail();
    const html = '<a href="/developers/api">Developer Portal</a>';
    const result = await checkDeveloperDocs(
      "https://example.com",
      html,
      5000,
    );
    expect(result.status).toBe("pass");
    expect(result.data?.paths).toContain("/developers");
  });

  it("returns fail when all 5 probes fail and no doc links in HTML", async () => {
    mockAllProbesFail();
    const result = await checkDeveloperDocs(
      "https://example.com",
      "<p>No docs</p>",
      5000,
    );
    expect(result.status).toBe("fail");
  });

  it("calls httpGet with method HEAD for all 5 probes", async () => {
    mockAllProbesFail();
    await checkDeveloperDocs("https://example.com", "", 5000);
    const calls = vi.mocked(httpGet).mock.calls;
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call[1]).toEqual(expect.objectContaining({ method: "HEAD" }));
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
    const result = await checkDeveloperDocs(
      "https://example.com",
      html,
      5000,
    );
    expect(result.status).toBe("pass");
    const paths = result.data?.paths as string[];
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
});
