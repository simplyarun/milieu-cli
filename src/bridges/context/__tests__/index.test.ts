import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanContext, HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

import { runContextBridge } from "../index.js";
import { httpGet } from "../../../utils/http-client.js";

const mockHttpGet = vi.mocked(httpGet);

function makeCtx(overrides?: Partial<ScanContext>): ScanContext {
  return {
    url: "https://example.com",
    domain: "example.com",
    baseUrl: "https://example.com",
    options: { timeout: 5000 },
    shared: {},
    ...overrides,
  };
}

function makeHttpSuccess(
  body: string,
  headers: Record<string, string> = {},
  status = 200,
): HttpResponse {
  return {
    ok: true,
    url: "https://example.com/api",
    status,
    headers,
    body,
    redirects: [],
    durationMs: 50,
  };
}

function makeHttpFailure(statusCode = 404): HttpResponse {
  return {
    ok: false,
    error: {
      kind: "http_error",
      message: `HTTP ${statusCode}`,
      statusCode,
      url: "https://example.com",
    },
  };
}

describe("runContextBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all HTTP probes return 404
    mockHttpGet.mockResolvedValue(makeHttpFailure());
  });

  it("returns BridgeResult with id=5, name=Context, status=evaluated", async () => {
    const result = await runContextBridge(makeCtx());
    expect(result.id).toBe(5);
    expect(result.name).toBe("Context");
    expect(result.status).toBe("evaluated");
  });

  it("returns 7 checks", async () => {
    const result = await runContextBridge(makeCtx());
    expect(result.checks).toHaveLength(7);
  });

  it("uses weighted scoring with max 14 points", async () => {
    // All fail → score should be 0
    const result = await runContextBridge(makeCtx());
    expect(result.score).toBe(0);
    expect(result.scoreLabel).toBe("fail");
  });

  it("uses lower thresholds: >=60 pass, >=30 partial, <30 fail", async () => {
    // No spec, no llms.txt → mostly fail
    const result = await runContextBridge(makeCtx());
    expect(result.score).toBeLessThan(30);
    expect(result.scoreLabel).toBe("fail");
  });

  it("stores contextProbeHeaders in ctx.shared", async () => {
    mockHttpGet.mockResolvedValueOnce(
      makeHttpSuccess("", { "x-ratelimit-limit": "100" }),
    );
    const ctx = makeCtx();
    await runContextBridge(ctx);
    expect(ctx.shared.contextProbeHeaders).toBeDefined();
  });

  it("rate-limit check passes when header found", async () => {
    mockHttpGet.mockResolvedValueOnce(
      makeHttpSuccess("", { "x-ratelimit-limit": "1000" }),
    );
    const result = await runContextBridge(makeCtx());
    const rlCheck = result.checks.find(
      (c) => c.id === "context_rate_limit_headers",
    );
    expect(rlCheck?.status).toBe("pass");
  });

  it("agents.json check passes when valid JSON returned", async () => {
    // First call: rate-limit probe
    mockHttpGet.mockResolvedValueOnce(makeHttpFailure());
    // Second call: agents.json
    mockHttpGet.mockResolvedValueOnce(
      makeHttpSuccess(JSON.stringify({ name: "test" })),
    );

    const result = await runContextBridge(makeCtx());
    const agentsCheck = result.checks.find(
      (c) => c.id === "context_agents_json",
    );
    expect(agentsCheck?.status).toBe("pass");
  });

  it("evaluates auth clarity from spec", async () => {
    const ctx = makeCtx({
      shared: {
        openApiSpec: {
          components: {
            securitySchemes: {
              ApiKey: { type: "apiKey", description: "Key" },
            },
          },
          security: [{ ApiKey: [] }],
        },
      },
    });

    const result = await runContextBridge(ctx);
    const authCheck = result.checks.find(
      (c) => c.id === "context_auth_clarity",
    );
    expect(authCheck?.status).toBe("pass");
  });

  it("evaluates ToS from spec", async () => {
    const ctx = makeCtx({
      shared: {
        openApiSpec: {
          info: { termsOfService: "https://example.com/terms" },
        },
      },
    });

    const result = await runContextBridge(ctx);
    const tosCheck = result.checks.find((c) => c.id === "context_tos_url");
    expect(tosCheck?.status).toBe("pass");
  });

  it("evaluates AI policy from llmsTxtBody", async () => {
    const ctx = makeCtx({
      shared: {
        llmsTxtBody:
          "This API allows automated access for agent workflows and training data.",
      },
    });

    const result = await runContextBridge(ctx);
    const aiCheck = result.checks.find((c) => c.id === "context_ai_policy");
    expect(aiCheck?.status).toBe("pass");
  });

  it("durationMs is a non-negative number", async () => {
    const result = await runContextBridge(makeCtx());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
