import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkWebMcp } from "../webmcp.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(body: string): HttpResponse {
  return {
    ok: true,
    url: "https://example.com/.well-known/mcp.json",
    status: 200,
    headers: { "content-type": "application/json" },
    body,
    redirects: [],
    durationMs: 50,
  };
}

function make404(): HttpResponse {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404", statusCode: 404, url: "https://example.com/.well-known/mcp.json" },
  };
}

describe("checkWebMcp", () => {
  beforeEach(() => mockHttpGet.mockReset());

  it("returns pass with valid JSON", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(JSON.stringify({ serverInfo: {} })));
    const result = await checkWebMcp("https://example.com");
    expect(result.id).toBe("standards_webmcp");
    expect(result.status).toBe("pass");
  });

  it("returns partial with invalid JSON", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("not json"));
    const result = await checkWebMcp("https://example.com");
    expect(result.status).toBe("partial");
  });

  it("returns fail on 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkWebMcp("https://example.com");
    expect(result.status).toBe("fail");
  });
});
