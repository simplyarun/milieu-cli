import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkMcpEndpoint } from "../mcp.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

function makeJsonSuccess(body: string): HttpResponse {
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
    error: { kind: "http_error", message: "HTTP 404 Not Found", statusCode: 404, url: "https://example.com/.well-known/mcp.json" },
  };
}

describe("checkMcpEndpoint", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns Check with id 'mcp_endpoint' and label 'MCP Endpoint'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.id).toBe("mcp_endpoint");
    expect(result.label).toBe("MCP Endpoint");
  });

  it("returns pass for valid Server Card JSON", async () => {
    const body = JSON.stringify({ serverInfo: { name: "test" }, transport: {} });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("MCP endpoint found: MCP Server Card: test");
    expect(result.data).toEqual({ detail: "MCP Server Card: test" });
  });

  it("returns pass for legacy format with mcp_version", async () => {
    const body = JSON.stringify({ mcp_version: "1.0" });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("MCP endpoint found: MCP configuration detected");
  });

  it("returns pass for MCP primitives (tools)", async () => {
    const body = JSON.stringify({ tools: [] });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("MCP endpoint found: MCP primitives detected");
  });

  it("returns partial for valid JSON but no MCP fields", async () => {
    const body = JSON.stringify({ name: "something", version: "1.0" });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.status).toBe("partial");
    expect(result.detail).toBe("MCP endpoint found but structure unclear");
    expect(result.data).toEqual({ detail: "JSON found but no MCP fields" });
  });

  it("returns fail on HTTP 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No MCP endpoint found");
  });

  it("returns fail for non-JSON body", async () => {
    mockHttpGet.mockResolvedValue(makeJsonSuccess("not valid json"));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No MCP endpoint found");
  });

  it("sends Accept: application/json header", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkMcpEndpoint("https://example.com", 5000);
    expect(mockHttpGet).toHaveBeenCalledWith(
      "https://example.com/.well-known/mcp.json",
      { timeout: 5000, headers: { Accept: "application/json" } },
    );
  });
});
