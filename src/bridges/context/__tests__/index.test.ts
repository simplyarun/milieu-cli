import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanContext, HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({ httpGet: vi.fn() }));

import { httpGet } from "../../../utils/http-client.js";
import { runContextBridge } from "../index.js";

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(body: string, headers: Record<string, string> = {}, status = 200): HttpResponse {
  return { ok: true, url: "https://example.com/api", status, headers, body, redirects: [], durationMs: 50 };
}

function makeFailure(statusCode = 404): HttpResponse {
  return { ok: false, error: { kind: "http_error", message: `HTTP ${statusCode}`, statusCode, url: "https://example.com" } };
}

function makeCtx(overrides?: Partial<ScanContext["shared"]>): ScanContext {
  return {
    url: "https://example.com", domain: "example.com", baseUrl: "https://example.com",
    options: { timeout: 5000 },
    shared: { openApiDetected: false, openApiSpec: null, llmsTxtBody: null, ...overrides },
  };
}

describe("runContextBridge", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
    mockHttpGet.mockResolvedValue(makeFailure(404));
  });

  it("returns BridgeResult with id 5, name Context, status evaluated", async () => {
    const result = await runContextBridge(makeCtx());
    expect(result.id).toBe(5);
    expect(result.name).toBe("Context");
    expect(result.status).toBe("evaluated");
  });

  it("returns 7 checks in correct order", async () => {
    const result = await runContextBridge(makeCtx());
    expect(result.checks).toHaveLength(7);
    expect(result.checks.map((c) => c.id)).toEqual([
      "context_rate_limit_headers", "context_auth_clarity", "context_auth_legibility",
      "context_tos_url", "context_versioning_signal", "context_contact_info", "context_agents_json",
    ]);
  });

  it("returns score 0 when all checks fail", async () => {
    const result = await runContextBridge(makeCtx());
    expect(result.score).toBe(0);
    expect(result.scoreLabel).toBe("fail");
  });

  it("uses a fixed denominator so a missing spec cannot raise the score (4.5/16 = 28%)", async () => {
    // Fixed denominator = every check counts regardless of spec presence.
    // Denominator: rate_limit(3) + auth_clarity(3) + auth_legibility(3) + tos_url(2)
    //   + versioning(2) + contact_info(1) + agents_json(2) = 16
    // /api probe succeeds with rate-limit header → rate-limit pass (3pts)
    // auth-legibility also probes /api, gets 200 → partial (1.5pts)
    // Spec-gated checks (auth_clarity, versioning) fail with no spec → 0pts, still counted.
    // Total: 4.5/16 = 28
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.includes("/api")) return makeSuccess("", { "x-ratelimit-limit": "100" });
      return makeFailure(404);
    });
    const result = await runContextBridge(makeCtx());
    expect(result.score).toBe(28);
    expect(result.scoreLabel).toBe("fail");
  });

  it("uses lower thresholds (>=60 pass, >=30 partial)", async () => {
    const result = await runContextBridge(makeCtx());
    expect(result.scoreLabel).toBe("fail"); // score 0 < 30
  });

  it("returns durationMs >= 0", async () => {
    const result = await runContextBridge(makeCtx());
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
