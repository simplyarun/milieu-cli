import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpResponse, ScanContext } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

import { runReachabilityBridge } from "../index.js";
import { httpGet } from "../../../utils/http-client.js";

const mockHttpGet = vi.mocked(httpGet);

function makeCtx(): ScanContext {
  return {
    url: "https://example.com",
    domain: "example.com",
    baseUrl: "https://example.com",
    options: { timeout: 5000 },
    shared: {},
  };
}

function makeSuccess(url: string): HttpResponse {
  return { ok: true, url, status: 200, headers: {}, body: "<html></html>", redirects: [], durationMs: 10 };
}

function makeBudgetDenied(url: string): HttpResponse {
  return {
    ok: false,
    error: { kind: "request_budget_exhausted", message: "Scan request budget exhausted", url },
  };
}

describe("runReachabilityBridge under request-budget exhaustion", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("reports error (not false pass) for page-dependent checks when the page GET is denied", async () => {
    // HEAD succeeds (no abort); every subsequent GET is budget-denied.
    mockHttpGet.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === "HEAD") return makeSuccess(url);
      return makeBudgetDenied(url);
    });

    const result = await runReachabilityBridge(makeCtx());
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));

    expect(result.abort).toBeUndefined();
    expect(byId.http_status.status).toBe("error");
    // Meta robots and X-Robots-Tag cannot be measured without the page —
    // an unmeasured surface must not award free passes.
    expect(byId.meta_robots.status).toBe("error");
    expect(byId.x_robots_tag.status).toBe("error");
    expect(byId.robots_txt.status).toBe("error");
  });

  it("reports page controls as unmeasured on a failed page request", async () => {
    mockHttpGet.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === "HEAD") return makeSuccess(url);
      return {
        ok: false,
        error: { kind: "http_error", message: "HTTP 500", statusCode: 500, url },
      };
    });

    const result = await runReachabilityBridge(makeCtx());
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));

    expect(byId.meta_robots.status).toBe("error");
    expect(byId.x_robots_tag.status).toBe("error");
    expect(byId.crawler_policy_gptbot.status).toBe("error");
  });

  it("uses the scanned origin for robots.txt and retains its port for the HTTPS probe", async () => {
    const baseUrl = "http://example.com:8080";
    mockHttpGet.mockImplementation(async (url, opts) => opts?.method === "HEAD"
      ? { ok: false, error: { kind: "ssl_error", message: "TLS unavailable", url } }
      : makeSuccess(url));

    const result = await runReachabilityBridge({ ...makeCtx(), baseUrl });
    expect(result.abort).toBeUndefined();
    expect(mockHttpGet.mock.calls.map(([url]) => url)).toEqual([
      "https://example.com:8080", baseUrl, baseUrl + "/robots.txt",
    ]);
  });

  it("aborts immediately when SSRF policy blocks the target", async () => {
    mockHttpGet.mockResolvedValue({ ok: false, error: {
      kind: "ssrf_blocked", message: "Blocked address", url: "https://example.com",
    } });
    expect((await runReachabilityBridge(makeCtx())).abortReason).toBe("ssrf_blocked");
    expect(mockHttpGet).toHaveBeenCalledTimes(1);
  });
});
