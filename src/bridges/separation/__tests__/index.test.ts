import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Check, CheckStatus, ContentSource, ScanContext } from "../../../core/types.js";
import type { DeveloperDocsResult } from "../developer-docs.js";

// Mock all 4 check modules
vi.mock("../api-presence.js", () => ({
  checkApiPresence: vi.fn(),
}));
vi.mock("../developer-docs.js", () => ({
  checkDeveloperDocs: vi.fn(),
}));
vi.mock("../sdk-references.js", () => ({
  checkSdkReferences: vi.fn(),
}));
vi.mock("../webhook-support.js", () => ({
  checkWebhookSupport: vi.fn(),
}));

import { runSeparationBridge } from "../index.js";
import { checkApiPresence } from "../api-presence.js";
import { checkDeveloperDocs } from "../developer-docs.js";
import { checkSdkReferences } from "../sdk-references.js";
import { checkWebhookSupport } from "../webhook-support.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheck(status: CheckStatus, id = "test_check"): Check {
  return { id, label: "Test Check", status };
}

function makeDevDocsResult(
  status: CheckStatus,
  pages: ContentSource[] = [],
): DeveloperDocsResult {
  return {
    check: makeCheck(status, "developer_docs"),
    pages,
  };
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

function setupAllPass(devDocsPages: ContentSource[] = []): void {
  vi.mocked(checkApiPresence).mockReturnValue(
    makeCheck("pass", "api_presence"),
  );
  vi.mocked(checkDeveloperDocs).mockResolvedValue(
    makeDevDocsResult("pass", devDocsPages),
  );
  vi.mocked(checkSdkReferences).mockReturnValue(
    makeCheck("pass", "sdk_references"),
  );
  vi.mocked(checkWebhookSupport).mockReturnValue(
    makeCheck("pass", "webhook_support"),
  );
}

function setupAllFail(): void {
  vi.mocked(checkApiPresence).mockReturnValue(
    makeCheck("fail", "api_presence"),
  );
  vi.mocked(checkDeveloperDocs).mockResolvedValue(
    makeDevDocsResult("fail"),
  );
  vi.mocked(checkSdkReferences).mockReturnValue(
    makeCheck("fail", "sdk_references"),
  );
  vi.mocked(checkWebhookSupport).mockReturnValue(
    makeCheck("fail", "webhook_support"),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runSeparationBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns BridgeResult with id 3, name Separation, status evaluated", async () => {
    setupAllPass();
    const result = await runSeparationBridge(makeCtx());
    expect(result.id).toBe(3);
    expect(result.name).toBe("Separation");
    expect(result.status).toBe("evaluated");
  });

  it("returns score null (not a number)", async () => {
    setupAllPass();
    const result = await runSeparationBridge(makeCtx());
    expect(result.score).toBeNull();
  });

  it("returns scoreLabel null (not a string)", async () => {
    setupAllPass();
    const result = await runSeparationBridge(makeCtx());
    expect(result.scoreLabel).toBeNull();
  });

  it("returns exactly 4 checks in order: api_presence, developer_docs, sdk_references, webhook_support", async () => {
    setupAllPass();
    const result = await runSeparationBridge(makeCtx());
    expect(result.checks).toHaveLength(4);
    const ids = result.checks.map((c) => c.id);
    expect(ids).toEqual([
      "api_presence",
      "developer_docs",
      "sdk_references",
      "webhook_support",
    ]);
  });

  it("passes ctx.shared.openApiDetected to checkApiPresence as first argument", async () => {
    setupAllPass();
    const ctx = makeCtx({ shared: { openApiDetected: true } });
    await runSeparationBridge(ctx);
    expect(checkApiPresence).toHaveBeenCalledWith(
      true,
      expect.any(Array),
      expect.any(Object),
      expect.any(Boolean),
    );
  });

  it("passes ContentSource[] to checkApiPresence, checkSdkReferences, and checkWebhookSupport", async () => {
    setupAllPass();
    const ctx = makeCtx({ shared: { pageBody: "<html>test</html>" } });
    await runSeparationBridge(ctx);

    // All three pure-function checks receive the same ContentSource[] array
    const expectedSources: ContentSource[] = [
      { content: "<html>test</html>", source: "homepage" },
    ];

    // checkApiPresence: 2nd arg is ContentSource[], 4th is graphqlDetected
    expect(checkApiPresence).toHaveBeenCalledWith(
      expect.anything(),
      expectedSources,
      expect.any(Object),
      expect.any(Boolean),
    );
    // checkSdkReferences: 1st arg is ContentSource[]
    expect(checkSdkReferences).toHaveBeenCalledWith(expectedSources);
    // checkWebhookSupport: 1st arg is ContentSource[], 2nd is options
    expect(checkWebhookSupport).toHaveBeenCalledWith(expectedSources, expect.objectContaining({
      pageHeaders: expect.any(Object),
    }));
  });

  it("still passes pageBody to checkDeveloperDocs as 2nd argument", async () => {
    setupAllPass();
    const ctx = makeCtx({ shared: { pageBody: "<html>test</html>" } });
    await runSeparationBridge(ctx);
    expect(checkDeveloperDocs).toHaveBeenCalledWith(
      expect.any(String),
      "<html>test</html>",
      expect.anything(),
    );
  });

  it("passes ctx.shared.pageHeaders to checkApiPresence as third argument", async () => {
    setupAllPass();
    const headers = { "x-request-id": "abc123" };
    const ctx = makeCtx({ shared: { pageHeaders: headers } });
    await runSeparationBridge(ctx);
    expect(checkApiPresence).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      headers,
      expect.any(Boolean),
    );
  });

  it("passes ctx.baseUrl to checkDeveloperDocs as first argument", async () => {
    setupAllPass();
    const ctx = makeCtx({ baseUrl: "https://api.example.com" });
    await runSeparationBridge(ctx);
    expect(checkDeveloperDocs).toHaveBeenCalledWith(
      "https://api.example.com",
      expect.any(String),
      expect.anything(),
    );
  });

  it("passes ctx.options.timeout to checkDeveloperDocs as third argument", async () => {
    setupAllPass();
    const ctx = makeCtx({ options: { timeout: 8000 } });
    await runSeparationBridge(ctx);
    expect(checkDeveloperDocs).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      8000,
    );
  });

  it("defaults pageBody to empty string when ctx.shared.pageBody is undefined", async () => {
    setupAllPass();
    const ctx = makeCtx(); // shared: {} -- no pageBody
    await runSeparationBridge(ctx);
    // Empty pageBody means no homepage ContentSource is added
    expect(checkSdkReferences).toHaveBeenCalledWith([]);
    expect(checkWebhookSupport).toHaveBeenCalledWith([], expect.any(Object));
    expect(checkDeveloperDocs).toHaveBeenCalledWith(
      expect.any(String),
      "",
      expect.anything(),
    );
  });

  it("defaults pageHeaders to {} when ctx.shared.pageHeaders is undefined", async () => {
    setupAllPass();
    const ctx = makeCtx(); // shared: {} -- no pageHeaders
    await runSeparationBridge(ctx);
    expect(checkApiPresence).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      {},
      expect.any(Boolean),
    );
  });

  it("defaults openApiDetected to false when ctx.shared.openApiDetected is undefined", async () => {
    setupAllPass();
    const ctx = makeCtx(); // shared: {} -- no openApiDetected
    await runSeparationBridge(ctx);
    expect(checkApiPresence).toHaveBeenCalledWith(
      false,
      expect.any(Array),
      expect.any(Object),
      expect.any(Boolean),
    );
  });

  it("returns durationMs as a number >= 0", async () => {
    setupAllPass();
    const result = await runSeparationBridge(makeCtx());
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // --- ContentSource assembly tests ---

  it("assembles ContentSource[] with homepage, llmsTxtBody, and devDocs pages", async () => {
    const devPages: ContentSource[] = [
      { content: "docs content", source: "/docs" },
    ];
    setupAllPass(devPages);
    const ctx = makeCtx({
      shared: {
        pageBody: "<html>homepage</html>",
        llmsTxtBody: "llms.txt content",
      },
    });
    await runSeparationBridge(ctx);

    const expectedSources: ContentSource[] = [
      { content: "<html>homepage</html>", source: "homepage" },
      { content: "llms.txt content", source: "llms.txt" },
      { content: "docs content", source: "/docs" },
    ];

    expect(checkSdkReferences).toHaveBeenCalledWith(expectedSources);
    expect(checkWebhookSupport).toHaveBeenCalledWith(expectedSources, expect.any(Object));
    expect(checkApiPresence).toHaveBeenCalledWith(
      expect.anything(),
      expectedSources,
      expect.any(Object),
      expect.any(Boolean),
    );
  });

  it("omits llmsTxtBody from ContentSource[] when null", async () => {
    setupAllPass();
    const ctx = makeCtx({
      shared: { pageBody: "<html>homepage</html>" },
    });
    await runSeparationBridge(ctx);

    const expectedSources: ContentSource[] = [
      { content: "<html>homepage</html>", source: "homepage" },
    ];

    expect(checkSdkReferences).toHaveBeenCalledWith(expectedSources);
  });

  it("passes OpenAPI webhook flags and pageHeaders to checkWebhookSupport", async () => {
    setupAllPass();
    const ctx = makeCtx({
      shared: {
        pageBody: "<html>test</html>",
        pageHeaders: { link: '<https://hub.example.com>; rel="hub"' },
        openApiHasWebhooks: true,
        openApiHasCallbacks: false,
      },
    });
    await runSeparationBridge(ctx);
    expect(checkWebhookSupport).toHaveBeenCalledWith(
      expect.any(Array),
      {
        pageHeaders: { link: '<https://hub.example.com>; rel="hub"' },
        openApiHasWebhooks: true,
        openApiHasCallbacks: false,
      },
    );
  });

  it("defaults OpenAPI webhook flags to false when not in shared context", async () => {
    setupAllPass();
    const ctx = makeCtx(); // shared: {} — no OpenAPI flags
    await runSeparationBridge(ctx);
    expect(checkWebhookSupport).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        openApiHasWebhooks: false,
        openApiHasCallbacks: false,
      }),
    );
  });

  it("stores devDocsBodies in ctx.shared", async () => {
    const devPages: ContentSource[] = [
      { content: "docs body", source: "/docs" },
    ];
    setupAllPass(devPages);
    const ctx = makeCtx();
    await runSeparationBridge(ctx);
    expect(ctx.shared.devDocsBodies).toEqual(devPages);
  });
});
