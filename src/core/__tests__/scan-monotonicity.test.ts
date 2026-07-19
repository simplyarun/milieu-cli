import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ScanOutcome, ScanResult } from "../types.js";

// Real bridges, real HTTP client — only DNS and the network are stubbed.
// This exercises scan() end-to-end through all five bridges and the shared
// context, which the per-module unit tests never do.
vi.mock("../../utils/ssrf.js", () => ({
  validateDns: vi.fn(async () => ({ safe: true, ip: "93.184.216.34" })),
  isPrivateIp: vi.fn(() => false),
}));

import { scan } from "../scan.js";

function assertOk(outcome: ScanOutcome): asserts outcome is ScanResult {
  expect(outcome.ok).toBe(true);
}

const OPENAPI_SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        responses: { "200": { description: "A list of users" } },
      },
    },
  },
});

/** A fetch stub: 404 for everything except (optionally) a self-hosted spec. */
function networkStub(serveSpec: boolean) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (serveSpec && url.endsWith("/openapi.json")) {
      return new Response(OPENAPI_SPEC, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("", { status: 404 });
  });
}

describe("scan() scoring is monotone and reproducible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishing an OpenAPI spec never lowers the overall score", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const noSpec = await scan("https://example.com", { silent: true });
    assertOk(noSpec);

    vi.stubGlobal("fetch", networkStub(true));
    const withSpec = await scan("https://example.com", { silent: true });
    assertOk(withSpec);

    // The whole point of monotone scoring: adding a signal can only help.
    expect(withSpec.overallScore).toBeGreaterThanOrEqual(noSpec.overallScore);
    // And in this case it strictly helps — the spec is discoverable.
    expect(withSpec.overallScore).toBeGreaterThan(noSpec.overallScore);
  });

  it("Bridge 4 scores 0 (not null) with no spec, and > 0 once a spec is found", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const noSpec = await scan("https://example.com", { silent: true });
    assertOk(noSpec);
    expect(noSpec.bridges[3].id).toBe(4);
    expect(noSpec.bridges[3].score).toBe(0);

    vi.stubGlobal("fetch", networkStub(true));
    const withSpec = await scan("https://example.com", { silent: true });
    assertOk(withSpec);
    expect(withSpec.bridges[3].score).toBeGreaterThan(0);
  });

  it("produces the same score for the same surface state (reproducible)", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const first = await scan("https://example.com", { silent: true });
    assertOk(first);

    vi.stubGlobal("fetch", networkStub(false));
    const second = await scan("https://example.com", { silent: true });
    assertOk(second);

    expect(second.overallScore).toBe(first.overallScore);
    expect(second.bridges.map((b) => b.score)).toEqual(
      first.bridges.map((b) => b.score),
    );
  });

  it("only Bridge 3 has a null score; Bridges 1, 2, 4, 5 are always numeric", async () => {
    vi.stubGlobal("fetch", networkStub(false));
    const result = await scan("https://example.com", { silent: true });
    assertOk(result);

    const nullScored = result.bridges.filter((b) => b.score === null).map((b) => b.id);
    expect(nullScored).toEqual([3]);
  });
});
