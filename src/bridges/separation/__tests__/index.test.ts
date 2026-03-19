import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Check, CheckStatus, ScanContext } from "../../../core/types.js";

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
  vi.mocked(checkApiPresence).mockReturnValue(
    makeCheck("pass", "api_presence"),
  );
  vi.mocked(checkDeveloperDocs).mockResolvedValue(
    makeCheck("pass", "developer_docs"),
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
    makeCheck("fail", "developer_docs"),
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
      expect.any(String),
      expect.any(Object),
    );
  });

  it("passes ctx.shared.pageBody to checkApiPresence, checkSdkReferences, checkWebhookSupport, and checkDeveloperDocs", async () => {
    setupAllPass();
    const ctx = makeCtx({ shared: { pageBody: "<html>test</html>" } });
    await runSeparationBridge(ctx);

    // checkApiPresence: 2nd arg is pageBody
    expect(checkApiPresence).toHaveBeenCalledWith(
      expect.anything(),
      "<html>test</html>",
      expect.any(Object),
    );
    // checkDeveloperDocs: 2nd arg is pageBody
    expect(checkDeveloperDocs).toHaveBeenCalledWith(
      expect.any(String),
      "<html>test</html>",
      expect.anything(),
    );
    // checkSdkReferences: 1st arg is pageBody
    expect(checkSdkReferences).toHaveBeenCalledWith("<html>test</html>");
    // checkWebhookSupport: 1st arg is pageBody
    expect(checkWebhookSupport).toHaveBeenCalledWith("<html>test</html>");
  });

  it("passes ctx.shared.pageHeaders to checkApiPresence as third argument", async () => {
    setupAllPass();
    const headers = { "x-request-id": "abc123" };
    const ctx = makeCtx({ shared: { pageHeaders: headers } });
    await runSeparationBridge(ctx);
    expect(checkApiPresence).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      headers,
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
    expect(checkApiPresence).toHaveBeenCalledWith(
      expect.anything(),
      "",
      expect.any(Object),
    );
    expect(checkSdkReferences).toHaveBeenCalledWith("");
    expect(checkWebhookSupport).toHaveBeenCalledWith("");
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
      expect.any(String),
      {},
    );
  });

  it("defaults openApiDetected to false when ctx.shared.openApiDetected is undefined", async () => {
    setupAllPass();
    const ctx = makeCtx(); // shared: {} -- no openApiDetected
    await runSeparationBridge(ctx);
    expect(checkApiPresence).toHaveBeenCalledWith(
      false,
      expect.any(String),
      expect.any(Object),
    );
  });

  it("returns durationMs as a number >= 0", async () => {
    setupAllPass();
    const result = await runSeparationBridge(makeCtx());
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("does NOT modify ctx.shared (no writes)", async () => {
    setupAllPass();
    const ctx = makeCtx({
      shared: {
        openApiDetected: true,
        pageBody: "<html></html>",
        pageHeaders: { "content-type": "text/html" },
      },
    });
    const sharedBefore = { ...ctx.shared };
    await runSeparationBridge(ctx);
    expect(ctx.shared).toEqual(sharedBefore);
  });
});
