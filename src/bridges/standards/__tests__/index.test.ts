import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Check, CheckStatus, ScanContext } from "../../../core/types.js";

// Mock all check modules
vi.mock("../openapi.js", () => ({
  checkOpenApi: vi.fn(),
}));
vi.mock("../llms-txt.js", () => ({
  checkLlmsTxt: vi.fn(),
  checkLlmsFullTxt: vi.fn(),
}));
vi.mock("../mcp.js", () => ({
  checkMcpEndpoint: vi.fn(),
}));
vi.mock("../json-ld.js", () => ({
  checkJsonLd: vi.fn(),
}));
vi.mock("../schema-org.js", () => ({
  checkSchemaOrg: vi.fn(),
}));
vi.mock("../well-known.js", () => ({
  checkSecurityTxt: vi.fn(),
}));
vi.mock("../graphql.js", () => ({
  checkGraphql: vi.fn(),
}));
vi.mock("../sitemap.js", () => ({
  checkSitemap: vi.fn(),
}));
vi.mock("../markdown-negotiation.js", () => ({
  checkMarkdownNegotiation: vi.fn(),
}));
vi.mock("../webmcp.js", () => ({
  checkWebMcp: vi.fn(),
}));
vi.mock("../a2a-agent-card.js", () => ({
  checkA2aAgentCard: vi.fn(),
}));

import { runStandardsBridge } from "../index.js";
import { checkOpenApi } from "../openapi.js";
import { checkLlmsTxt, checkLlmsFullTxt } from "../llms-txt.js";
import { checkMcpEndpoint } from "../mcp.js";
import { checkJsonLd } from "../json-ld.js";
import { checkSchemaOrg } from "../schema-org.js";
import { checkSecurityTxt } from "../well-known.js";
import { checkGraphql } from "../graphql.js";
import { checkSitemap } from "../sitemap.js";
import { checkMarkdownNegotiation } from "../markdown-negotiation.js";
import { checkWebMcp } from "../webmcp.js";
import { checkA2aAgentCard } from "../a2a-agent-card.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheck(status: CheckStatus, id = "test_check"): Check {
  return { id, label: "Test Check", status };
}

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

function setupAllPass(): void {
  vi.mocked(checkOpenApi).mockResolvedValue({
    check: makeCheck("pass", "openapi_spec"),
    detected: true,
    hasWebhooks: false,
    hasCallbacks: false,
    parsedSpec: null,
  });
  vi.mocked(checkGraphql).mockResolvedValue({
    check: makeCheck("pass", "graphql_endpoint"),
    detected: true,
  });
  vi.mocked(checkSitemap).mockResolvedValue({
    check: makeCheck("pass", "sitemap"),
    urls: ["https://example.com/page1"],
    apiRelevantUrls: [],
  });
  vi.mocked(checkMarkdownNegotiation).mockResolvedValue({
    check: makeCheck("pass", "markdown_negotiation"),
    supported: true,
  });
  vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("pass", "llms_txt"), body: "# Example\n\nContent here" });
  vi.mocked(checkLlmsFullTxt).mockResolvedValue(
    makeCheck("pass", "llms_full_txt"),
  );
  vi.mocked(checkMcpEndpoint).mockResolvedValue({
    check: makeCheck("pass", "mcp_endpoint"),
    detected: true,
  });
  vi.mocked(checkJsonLd).mockReturnValue(makeCheck("pass", "json_ld"));
  vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("pass", "schema_org"));
  vi.mocked(checkSecurityTxt).mockResolvedValue(
    makeCheck("pass", "security_txt"),
  );
  vi.mocked(checkWebMcp).mockResolvedValue(makeCheck("pass", "standards_webmcp"));
  vi.mocked(checkA2aAgentCard).mockResolvedValue(makeCheck("pass", "standards_a2a_agent_card"));
}

function setupAllFail(): void {
  vi.mocked(checkOpenApi).mockResolvedValue({
    check: makeCheck("fail", "openapi_spec"),
    detected: false,
    hasWebhooks: false,
    hasCallbacks: false,
    parsedSpec: null,
  });
  vi.mocked(checkGraphql).mockResolvedValue({
    check: makeCheck("fail", "graphql_endpoint"),
    detected: false,
  });
  vi.mocked(checkSitemap).mockResolvedValue({
    check: makeCheck("fail", "sitemap"),
    urls: [],
    apiRelevantUrls: [],
  });
  vi.mocked(checkMarkdownNegotiation).mockResolvedValue({
    check: makeCheck("fail", "markdown_negotiation"),
    supported: false,
  });
  vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("fail", "llms_txt"), body: null });
  vi.mocked(checkLlmsFullTxt).mockResolvedValue(
    makeCheck("fail", "llms_full_txt"),
  );
  vi.mocked(checkMcpEndpoint).mockResolvedValue({
    check: makeCheck("fail", "mcp_endpoint"),
    detected: false,
  });
  vi.mocked(checkJsonLd).mockReturnValue(makeCheck("fail", "json_ld"));
  vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("fail", "schema_org"));
  vi.mocked(checkSecurityTxt).mockResolvedValue(
    makeCheck("fail", "security_txt"),
  );
  vi.mocked(checkWebMcp).mockResolvedValue(makeCheck("fail", "standards_webmcp"));
  vi.mocked(checkA2aAgentCard).mockResolvedValue(makeCheck("fail", "standards_a2a_agent_card"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runStandardsBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns BridgeResult with id 2, name Standards, status evaluated", async () => {
    setupAllPass();
    const result = await runStandardsBridge(makeCtx());
    expect(result.id).toBe(2);
    expect(result.name).toBe("Standards");
    expect(result.status).toBe("evaluated");
  });

  it("includes all 12 checks in result.checks array", async () => {
    setupAllPass();
    const result = await runStandardsBridge(makeCtx());
    expect(result.checks).toHaveLength(12);
    const ids = result.checks.map((c) => c.id);
    expect(ids).toEqual([
      "openapi_spec",
      "graphql_endpoint",
      "sitemap",
      "markdown_negotiation",
      "llms_txt",
      "llms_full_txt",
      "mcp_endpoint",
      "json_ld",
      "schema_org",
      "security_txt",
      "standards_webmcp",
      "standards_a2a_agent_card",
    ]);
  });

  it("returns score 100 and scoreLabel pass when all 12 checks pass", async () => {
    setupAllPass();
    const result = await runStandardsBridge(makeCtx());
    expect(result.score).toBe(100);
    expect(result.scoreLabel).toBe("pass");
  });

  it("returns score 33 and scoreLabel fail when 4 pass + 8 fail", async () => {
    // First 4 pass, rest fail (12 checks total: 4/12 = 33%)
    vi.mocked(checkOpenApi).mockResolvedValue({
      check: makeCheck("pass", "openapi_spec"),
      detected: true,
      hasWebhooks: false,
      hasCallbacks: false,
      parsedSpec: null,
    });
    vi.mocked(checkGraphql).mockResolvedValue({
      check: makeCheck("pass", "graphql_endpoint"),
      detected: true,
    });
    vi.mocked(checkSitemap).mockResolvedValue({
      check: makeCheck("pass", "sitemap"),
      urls: [],
      apiRelevantUrls: [],
    });
    vi.mocked(checkMarkdownNegotiation).mockResolvedValue({
      check: makeCheck("pass", "markdown_negotiation"),
      supported: true,
    });
    vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("fail", "llms_txt"), body: null });
    vi.mocked(checkLlmsFullTxt).mockResolvedValue(
      makeCheck("fail", "llms_full_txt"),
    );
    vi.mocked(checkMcpEndpoint).mockResolvedValue({
      check: makeCheck("fail", "mcp_endpoint"),
      detected: false,
    });
    vi.mocked(checkJsonLd).mockReturnValue(makeCheck("fail", "json_ld"));
    vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("fail", "schema_org"));
    vi.mocked(checkSecurityTxt).mockResolvedValue(
      makeCheck("fail", "security_txt"),
    );
    vi.mocked(checkWebMcp).mockResolvedValue(makeCheck("fail", "standards_webmcp"));
    vi.mocked(checkA2aAgentCard).mockResolvedValue(makeCheck("fail", "standards_a2a_agent_card"));

    const result = await runStandardsBridge(makeCtx());
    expect(result.score).toBe(33);
    expect(result.scoreLabel).toBe("fail");
  });

  it("returns score 0 and scoreLabel fail when all 12 checks fail", async () => {
    setupAllFail();
    const result = await runStandardsBridge(makeCtx());
    expect(result.score).toBe(0);
    expect(result.scoreLabel).toBe("fail");
  });

  it("returns score 25 and scoreLabel fail for 2 pass + 2 partial + 8 fail", async () => {
    // 2 pass (2 points) + 2 partial (1 point) + 8 fail (0) = 3/12 = 25%
    vi.mocked(checkOpenApi).mockResolvedValue({
      check: makeCheck("pass", "openapi_spec"),
      detected: true,
      hasWebhooks: false,
      hasCallbacks: false,
      parsedSpec: null,
    });
    vi.mocked(checkGraphql).mockResolvedValue({
      check: makeCheck("fail", "graphql_endpoint"),
      detected: false,
    });
    vi.mocked(checkSitemap).mockResolvedValue({
      check: makeCheck("fail", "sitemap"),
      urls: [],
      apiRelevantUrls: [],
    });
    vi.mocked(checkMarkdownNegotiation).mockResolvedValue({
      check: makeCheck("fail", "markdown_negotiation"),
      supported: false,
    });
    vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("pass", "llms_txt"), body: "# Example\n\nContent here" });
    vi.mocked(checkLlmsFullTxt).mockResolvedValue(
      makeCheck("partial", "llms_full_txt"),
    );
    vi.mocked(checkMcpEndpoint).mockResolvedValue({
      check: makeCheck("partial", "mcp_endpoint"),
      detected: false,
    });
    vi.mocked(checkJsonLd).mockReturnValue(makeCheck("fail", "json_ld"));
    vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("fail", "schema_org"));
    vi.mocked(checkSecurityTxt).mockResolvedValue(
      makeCheck("fail", "security_txt"),
    );
    vi.mocked(checkWebMcp).mockResolvedValue(makeCheck("fail", "standards_webmcp"));
    vi.mocked(checkA2aAgentCard).mockResolvedValue(makeCheck("fail", "standards_a2a_agent_card"));

    const result = await runStandardsBridge(makeCtx());
    expect(result.score).toBe(25);
    expect(result.scoreLabel).toBe("fail");
  });

  it("sets ctx.shared.openApiDetected to true when OpenAPI found", async () => {
    setupAllPass(); // checkOpenApi returns detected: true
    const ctx = makeCtx();
    await runStandardsBridge(ctx);
    expect(ctx.shared.openApiDetected).toBe(true);
  });

  it("sets ctx.shared.openApiDetected to false when OpenAPI not found", async () => {
    setupAllFail(); // checkOpenApi returns detected: false
    const ctx = makeCtx();
    await runStandardsBridge(ctx);
    expect(ctx.shared.openApiDetected).toBe(false);
  });

  it("passes ctx.shared.pageBody to JSON-LD and Schema.org checks", async () => {
    setupAllPass();
    const ctx = makeCtx({ shared: { pageBody: "<html>test</html>" } });
    await runStandardsBridge(ctx);

    expect(checkJsonLd).toHaveBeenCalledWith("<html>test</html>");
    expect(checkSchemaOrg).toHaveBeenCalledWith(
      "<html>test</html>",
      expect.any(Object),
    );
  });

  it("passes empty string to JSON-LD and Schema.org when pageBody is undefined", async () => {
    setupAllPass();
    const ctx = makeCtx(); // shared: {} -- no pageBody
    await runStandardsBridge(ctx);

    expect(checkJsonLd).toHaveBeenCalledWith("");
    expect(checkSchemaOrg).toHaveBeenCalledWith("", expect.any(Object));
  });

  it("returns durationMs as a number >= 0", async () => {
    setupAllPass();
    const result = await runStandardsBridge(makeCtx());
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("stores llmsTxtBody in ctx.shared when llms.txt has content", async () => {
    setupAllPass();
    const ctx = makeCtx();
    await runStandardsBridge(ctx);
    expect(ctx.shared.llmsTxtBody).toBe("# Example\n\nContent here");
  });

  it("stores null llmsTxtBody in ctx.shared when llms.txt not found", async () => {
    setupAllFail();
    const ctx = makeCtx();
    await runStandardsBridge(ctx);
    expect(ctx.shared.llmsTxtBody).toBeNull();
  });

  it("stores openApiHasWebhooks and openApiHasCallbacks in ctx.shared", async () => {
    vi.mocked(checkOpenApi).mockResolvedValue({
      check: makeCheck("pass", "openapi_spec"),
      detected: true,
      hasWebhooks: true,
      hasCallbacks: true,
      parsedSpec: null,
    });
    vi.mocked(checkGraphql).mockResolvedValue({ check: makeCheck("pass", "graphql_endpoint"), detected: true });
    vi.mocked(checkSitemap).mockResolvedValue({ check: makeCheck("pass", "sitemap"), urls: [], apiRelevantUrls: [] });
    vi.mocked(checkMarkdownNegotiation).mockResolvedValue({ check: makeCheck("pass", "markdown_negotiation"), supported: true });
    vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("pass", "llms_txt"), body: null });
    vi.mocked(checkLlmsFullTxt).mockResolvedValue(makeCheck("pass", "llms_full_txt"));
    vi.mocked(checkMcpEndpoint).mockResolvedValue({ check: makeCheck("pass", "mcp_endpoint"), detected: true });
    vi.mocked(checkJsonLd).mockReturnValue(makeCheck("pass", "json_ld"));
    vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("pass", "schema_org"));
    vi.mocked(checkSecurityTxt).mockResolvedValue(makeCheck("pass", "security_txt"));
    vi.mocked(checkWebMcp).mockResolvedValue(makeCheck("pass", "standards_webmcp"));
    vi.mocked(checkA2aAgentCard).mockResolvedValue(makeCheck("pass", "standards_a2a_agent_card"));

    const ctx = makeCtx();
    await runStandardsBridge(ctx);
    expect(ctx.shared.openApiHasWebhooks).toBe(true);
    expect(ctx.shared.openApiHasCallbacks).toBe(true);
  });

  it("stores false for webhook flags when no spec found", async () => {
    setupAllFail();
    const ctx = makeCtx();
    await runStandardsBridge(ctx);
    expect(ctx.shared.openApiHasWebhooks).toBe(false);
    expect(ctx.shared.openApiHasCallbacks).toBe(false);
  });

  it("stores ctx.shared.mcpDetected from MCP result", async () => {
    setupAllPass();
    const ctx = makeCtx();
    await runStandardsBridge(ctx);
    expect(ctx.shared.mcpDetected).toBe(true);
  });

  it("stores mcpDetected false when MCP not found", async () => {
    setupAllFail();
    const ctx = makeCtx();
    await runStandardsBridge(ctx);
    expect(ctx.shared.mcpDetected).toBe(false);
  });

  it("passes pageBody and llmsTxtBody to MCP check in Phase 2", async () => {
    setupAllPass();
    const ctx = makeCtx({ shared: { pageBody: "<html>test</html>" } });
    await runStandardsBridge(ctx);
    expect(checkMcpEndpoint).toHaveBeenCalledWith(
      "https://example.com",
      5000,
      "<html>test</html>",
      "# Example\n\nContent here",
    );
  });
});
