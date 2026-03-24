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

  // --- Basic identity ---

  it("returns McpResult with id 'mcp_endpoint' and label 'MCP Endpoint'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.check.id).toBe("mcp_endpoint");
    expect(result.check.label).toBe("MCP Endpoint");
  });

  // --- Tier 1: Endpoint probe ---

  it("returns pass for valid Server Card JSON", async () => {
    const body = JSON.stringify({ serverInfo: { name: "test" }, transport: {} });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.detail).toBe("MCP endpoint found: MCP Server Card: test");
    expect(result.check.data).toEqual({ detail: "MCP Server Card: test" });
    expect(result.detected).toBe(true);
  });

  it("returns pass for legacy format with mcp_version", async () => {
    const body = JSON.stringify({ mcp_version: "1.0" });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.detail).toBe("MCP endpoint found: MCP configuration detected");
    expect(result.detected).toBe(true);
  });

  it("returns pass for MCP primitives (tools)", async () => {
    const body = JSON.stringify({ tools: [] });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.detail).toBe("MCP endpoint found: MCP primitives detected");
    expect(result.detected).toBe(true);
  });

  it("returns partial for valid JSON but no MCP fields", async () => {
    const body = JSON.stringify({ name: "something", version: "1.0" });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.detail).toBe("MCP endpoint found but structure unclear");
    expect(result.detected).toBe(false);
  });

  it("returns fail on HTTP 404 with no content signals", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.check.detail).toBe("No MCP endpoint found");
    expect(result.detected).toBe(false);
  });

  it("returns fail for non-JSON body with no content signals", async () => {
    mockHttpGet.mockResolvedValue(makeJsonSuccess("not valid json"));
    const result = await checkMcpEndpoint("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  it("sends Accept: application/json header", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkMcpEndpoint("https://example.com", 5000);
    expect(mockHttpGet).toHaveBeenCalledWith(
      "https://example.com/.well-known/mcp.json",
      { timeout: 5000, headers: { Accept: "application/json" } },
    );
  });

  // --- Tier 2: Content scanning ---

  it("returns partial when pageBody mentions Model Context Protocol", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint(
      "https://example.com",
      undefined,
      '<p>We support the Model Context Protocol for AI agents.</p>',
    );
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toEqual({
      signals: ["Model Context Protocol"],
      source: "homepage",
    });
    expect(result.detected).toBe(true);
  });

  it("returns partial when pageBody references @modelcontextprotocol package", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint(
      "https://example.com",
      undefined,
      '<code>npm install @modelcontextprotocol/sdk</code>',
    );
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toEqual({
      signals: ["@modelcontextprotocol"],
      source: "homepage",
    });
    expect(result.detected).toBe(true);
  });

  it("returns partial when pageBody references mcp-server- pattern", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint(
      "https://example.com",
      undefined,
      'Check out our mcp-server-github integration.',
    );
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toEqual({
      signals: ["mcp-server-"],
      source: "homepage",
    });
    expect(result.detected).toBe(true);
  });

  it("returns partial when llmsTxtBody mentions MCP but pageBody does not", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint(
      "https://example.com",
      undefined,
      "<html>No MCP here</html>",
      "# Our API\n\nWe provide a Model Context Protocol server for integration.",
    );
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toEqual({
      signals: ["Model Context Protocol"],
      source: "llms.txt",
    });
    expect(result.detected).toBe(true);
  });

  it("returns partial when pageBody mentions MCP but llmsTxtBody does not", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint(
      "https://example.com",
      undefined,
      '<a href="https://modelcontextprotocol.io">MCP Docs</a>',
      "# Our API\n\nREST endpoints for data access.",
    );
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toEqual({
      signals: ["modelcontextprotocol.io"],
      source: "homepage",
    });
    expect(result.detected).toBe(true);
  });

  it("deduplicates signals and combines sources when both pageBody and llmsTxtBody match", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint(
      "https://example.com",
      undefined,
      '<p>We support the Model Context Protocol.</p>',
      "Model Context Protocol server available. See mcp-server-nerve.",
    );
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toEqual({
      signals: ["Model Context Protocol", "mcp-server-"],
      source: "homepage, llms.txt",
    });
    expect(result.detected).toBe(true);
  });

  // --- Precedence ---

  it("returns pass (not partial) when endpoint found AND page mentions MCP", async () => {
    const body = JSON.stringify({ serverInfo: { name: "nerve" }, transport: {} });
    mockHttpGet.mockResolvedValue(makeJsonSuccess(body));
    const result = await checkMcpEndpoint(
      "https://example.com",
      undefined,
      '<p>We support the Model Context Protocol.</p>',
    );
    // Endpoint pass takes priority — content scan is skipped
    expect(result.check.status).toBe("pass");
    expect(result.check.detail).toContain("MCP Server Card");
    expect(result.detected).toBe(true);
  });

  // --- False positive avoidance ---

  it("does NOT match bare 'MCP' without anchored context", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkMcpEndpoint(
      "https://example.com",
      undefined,
      '<p>Our MCP server room is located in the basement. MCP endpoint for monitoring.</p>',
    );
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });
});
