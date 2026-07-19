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

  it("keeps the free-pass semantics for ordinary page failures", async () => {
    mockHttpGet.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === "HEAD") return makeSuccess(url);
      return {
        ok: false,
        error: { kind: "http_error", message: "HTTP 500", statusCode: 500, url },
      };
    });

    const result = await runReachabilityBridge(makeCtx());
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));

    // Absence of restrictive tags on an unreachable page keeps the
    // long-standing "no restrictions found" pass.
    expect(byId.meta_robots.status).toBe("pass");
    expect(byId.x_robots_tag.status).toBe("pass");
  });
});
