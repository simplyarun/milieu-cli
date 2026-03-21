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
  checkAiPlugin: vi.fn(),
}));

import { runStandardsBridge } from "../index.js";
import { checkOpenApi } from "../openapi.js";
import { checkLlmsTxt, checkLlmsFullTxt } from "../llms-txt.js";
import { checkMcpEndpoint } from "../mcp.js";
import { checkJsonLd } from "../json-ld.js";
import { checkSchemaOrg } from "../schema-org.js";
import { checkSecurityTxt, checkAiPlugin } from "../well-known.js";

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
  });
  vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("pass", "llms_txt"), body: "# Example\n\nContent here" });
  vi.mocked(checkLlmsFullTxt).mockResolvedValue(
    makeCheck("pass", "llms_full_txt"),
  );
  vi.mocked(checkMcpEndpoint).mockResolvedValue(
    makeCheck("pass", "mcp_endpoint"),
  );
  vi.mocked(checkJsonLd).mockReturnValue(makeCheck("pass", "json_ld"));
  vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("pass", "schema_org"));
  vi.mocked(checkSecurityTxt).mockResolvedValue(
    makeCheck("pass", "security_txt"),
  );
  vi.mocked(checkAiPlugin).mockResolvedValue(makeCheck("pass", "ai_plugin"));
}

function setupAllFail(): void {
  vi.mocked(checkOpenApi).mockResolvedValue({
    check: makeCheck("fail", "openapi_spec"),
    detected: false,
  });
  vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("fail", "llms_txt"), body: null });
  vi.mocked(checkLlmsFullTxt).mockResolvedValue(
    makeCheck("fail", "llms_full_txt"),
  );
  vi.mocked(checkMcpEndpoint).mockResolvedValue(
    makeCheck("fail", "mcp_endpoint"),
  );
  vi.mocked(checkJsonLd).mockReturnValue(makeCheck("fail", "json_ld"));
  vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("fail", "schema_org"));
  vi.mocked(checkSecurityTxt).mockResolvedValue(
    makeCheck("fail", "security_txt"),
  );
  vi.mocked(checkAiPlugin).mockResolvedValue(makeCheck("fail", "ai_plugin"));
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

  it("includes all 8 checks in result.checks array", async () => {
    setupAllPass();
    const result = await runStandardsBridge(makeCtx());
    expect(result.checks).toHaveLength(8);
    const ids = result.checks.map((c) => c.id);
    expect(ids).toEqual([
      "openapi_spec",
      "llms_txt",
      "llms_full_txt",
      "mcp_endpoint",
      "json_ld",
      "schema_org",
      "security_txt",
      "ai_plugin",
    ]);
  });

  it("returns score 100 and scoreLabel pass when all 8 checks pass", async () => {
    setupAllPass();
    const result = await runStandardsBridge(makeCtx());
    expect(result.score).toBe(100);
    expect(result.scoreLabel).toBe("pass");
  });

  it("returns score 50 and scoreLabel partial when 4 pass + 4 fail", async () => {
    // First 4 pass, last 4 fail
    vi.mocked(checkOpenApi).mockResolvedValue({
      check: makeCheck("pass", "openapi_spec"),
      detected: true,
    });
    vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("pass", "llms_txt"), body: "# Example\n\nContent here" });
    vi.mocked(checkLlmsFullTxt).mockResolvedValue(
      makeCheck("pass", "llms_full_txt"),
    );
    vi.mocked(checkMcpEndpoint).mockResolvedValue(
      makeCheck("pass", "mcp_endpoint"),
    );
    vi.mocked(checkJsonLd).mockReturnValue(makeCheck("fail", "json_ld"));
    vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("fail", "schema_org"));
    vi.mocked(checkSecurityTxt).mockResolvedValue(
      makeCheck("fail", "security_txt"),
    );
    vi.mocked(checkAiPlugin).mockResolvedValue(
      makeCheck("fail", "ai_plugin"),
    );

    const result = await runStandardsBridge(makeCtx());
    expect(result.score).toBe(50);
    expect(result.scoreLabel).toBe("partial");
  });

  it("returns score 0 and scoreLabel fail when all 8 checks fail", async () => {
    setupAllFail();
    const result = await runStandardsBridge(makeCtx());
    expect(result.score).toBe(0);
    expect(result.scoreLabel).toBe("fail");
  });

  it("returns score 38 and scoreLabel fail for 2 pass + 2 partial + 4 fail", async () => {
    // 2 pass (2 points) + 2 partial (1 point) + 4 fail (0) = 3/8 = 37.5 => 38
    vi.mocked(checkOpenApi).mockResolvedValue({
      check: makeCheck("pass", "openapi_spec"),
      detected: true,
    });
    vi.mocked(checkLlmsTxt).mockResolvedValue({ check: makeCheck("pass", "llms_txt"), body: "# Example\n\nContent here" });
    vi.mocked(checkLlmsFullTxt).mockResolvedValue(
      makeCheck("partial", "llms_full_txt"),
    );
    vi.mocked(checkMcpEndpoint).mockResolvedValue(
      makeCheck("partial", "mcp_endpoint"),
    );
    vi.mocked(checkJsonLd).mockReturnValue(makeCheck("fail", "json_ld"));
    vi.mocked(checkSchemaOrg).mockReturnValue(makeCheck("fail", "schema_org"));
    vi.mocked(checkSecurityTxt).mockResolvedValue(
      makeCheck("fail", "security_txt"),
    );
    vi.mocked(checkAiPlugin).mockResolvedValue(
      makeCheck("fail", "ai_plugin"),
    );

    const result = await runStandardsBridge(makeCtx());
    expect(result.score).toBe(38);
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
});
