import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ora - create a mock spinner object
const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  stop: vi.fn(),
  fail: vi.fn(),
  text: "",
};
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner),
}));

// Mock bridge runners
vi.mock("../../bridges/index.js", () => ({
  runReachabilityBridge: vi.fn(),
  runStandardsBridge: vi.fn(),
  runSeparationBridge: vi.fn(),
  runSchemaBridge: vi.fn(() => ({
    id: 4, name: "Schema", status: "evaluated", score: 50, scoreLabel: "partial", checks: [], durationMs: 10,
  })),
  runContextBridge: vi.fn(() => ({
    id: 5, name: "Context", status: "evaluated", score: 30, scoreLabel: "partial", checks: [], durationMs: 10,
  })),
}));

// Mock version module
vi.mock("../version.js", () => ({
  getVersion: vi.fn(() => "0.1.0"),
}));

// Mock utils
vi.mock("../../utils/index.js", () => ({
  normalizeUrl: vi.fn((url: string) => ({
    ok: true,
    href: url,
    domain: "example.com",
    baseUrl: url,
  })),
  extractDomain: vi.fn(() => "example.com"),
}));

import { scan } from "../scan.js";
import ora from "ora";
import {
  runReachabilityBridge,
  runStandardsBridge,
  runSeparationBridge,
  runSchemaBridge,
  runContextBridge,
} from "../../bridges/index.js";

import type { BridgeResult } from "../types.js";

const mockBridge1Normal: BridgeResult = {
  id: 1,
  name: "Reachability",
  status: "evaluated",
  score: 85,
  scoreLabel: "pass",
  checks: [
    { id: "https", label: "HTTPS available", status: "pass" },
    { id: "http_status", label: "HTTP status 200", status: "pass" },
  ],
  durationMs: 230,
};

const mockBridge2Normal: BridgeResult = {
  id: 2,
  name: "Standards",
  status: "evaluated",
  score: 63,
  scoreLabel: "partial",
  checks: [
    { id: "openapi", label: "OpenAPI spec", status: "pass" },
    { id: "llms_txt", label: "llms.txt", status: "fail" },
  ],
  durationMs: 1450,
};

const mockBridge3Normal: BridgeResult = {
  id: 3,
  name: "Separation",
  status: "evaluated",
  score: null,
  scoreLabel: null,
  checks: [
    { id: "api_presence", label: "API presence", status: "pass" },
    { id: "dev_docs", label: "Developer docs", status: "pass" },
    { id: "sdk_refs", label: "SDK references", status: "pass" },
    { id: "webhooks", label: "Webhook support", status: "fail" },
  ],
  durationMs: 320,
};

const mockBridge1Abort: BridgeResult = {
  id: 1,
  name: "Reachability",
  status: "evaluated",
  score: 0,
  scoreLabel: "fail",
  checks: [
    {
      id: "https",
      label: "HTTPS available",
      status: "fail",
      detail: "DNS resolution failed",
    },
  ],
  durationMs: 50,
  abort: true,
  abortReason: "dns",
};

describe("scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpinner.text = "";
    mockSpinner.start.mockReturnThis();
  });

  it("runs bridges sequentially and returns correct overall score", async () => {
    vi.mocked(runReachabilityBridge).mockResolvedValue(mockBridge1Normal);
    vi.mocked(runStandardsBridge).mockResolvedValue(mockBridge2Normal);
    vi.mocked(runSeparationBridge).mockResolvedValue(mockBridge3Normal);

    const result = await scan("https://example.com");

    expect(result.bridges).toHaveLength(5);
    // Overall score = Math.round((85 + 63 + 50 + 30) / 4) = 57
    expect(result.overallScore).toBe(57);
    expect(result.overallScoreLabel).toBe("partial");
    expect(runReachabilityBridge).toHaveBeenCalledOnce();
    expect(runStandardsBridge).toHaveBeenCalledOnce();
    expect(runSeparationBridge).toHaveBeenCalledOnce();
  });

  it("skips Bridges 2 and 3 when Bridge 1 aborts", async () => {
    vi.mocked(runReachabilityBridge).mockResolvedValue(mockBridge1Abort);

    const result = await scan("https://example.com");

    expect(runStandardsBridge).not.toHaveBeenCalled();
    expect(runSeparationBridge).not.toHaveBeenCalled();
    expect(vi.mocked(runSchemaBridge)).not.toHaveBeenCalled();
    expect(vi.mocked(runContextBridge)).not.toHaveBeenCalled();
    expect(result.bridges[0].abort).toBe(true);
    // Bridges 4 and 5 zeroed out
    expect(result.bridges[3].id).toBe(4);
    expect(result.bridges[3].status).toBe("evaluated");
    expect(result.bridges[3].score).toBe(0);
    expect(result.bridges[4].id).toBe(5);
    expect(result.bridges[4].status).toBe("evaluated");
    expect(result.bridges[4].score).toBe(0);
  });

  it("averages only non-null scores (excludes Bridge 3)", async () => {
    const bridge1 = { ...mockBridge1Normal, score: 90 as number | null, scoreLabel: "pass" as const };
    const bridge2 = { ...mockBridge2Normal, score: 70 as number | null, scoreLabel: "partial" as const };
    vi.mocked(runReachabilityBridge).mockResolvedValue(bridge1);
    vi.mocked(runStandardsBridge).mockResolvedValue(bridge2);
    vi.mocked(runSeparationBridge).mockResolvedValue(mockBridge3Normal);

    const result = await scan("https://example.com");

    // Math.round((90 + 70 + 50 + 30) / 4) = 60
    expect(result.overallScore).toBe(60);
    expect(result.overallScoreLabel).toBe("partial");
  });

  it("starts spinner and stops on success", async () => {
    vi.mocked(runReachabilityBridge).mockResolvedValue(mockBridge1Normal);
    vi.mocked(runStandardsBridge).mockResolvedValue(mockBridge2Normal);
    vi.mocked(runSeparationBridge).mockResolvedValue(mockBridge3Normal);

    await scan("https://example.com");

    expect(mockSpinner.start).toHaveBeenCalledOnce();
    expect(mockSpinner.stop).toHaveBeenCalledOnce();
    expect(mockSpinner.fail).not.toHaveBeenCalled();
  });

  it("calls spinner.fail on error and rethrows", async () => {
    const testError = new Error("connection refused");
    vi.mocked(runReachabilityBridge).mockRejectedValue(testError);

    await expect(scan("https://example.com")).rejects.toThrow(
      "connection refused",
    );
    expect(mockSpinner.fail).toHaveBeenCalledWith("Scan failed");
    expect(mockSpinner.stop).not.toHaveBeenCalled();
  });

  it("passes isSilent to ora when options.silent is true", async () => {
    vi.mocked(runReachabilityBridge).mockResolvedValue(mockBridge1Normal);
    vi.mocked(runStandardsBridge).mockResolvedValue(mockBridge2Normal);
    vi.mocked(runSeparationBridge).mockResolvedValue(mockBridge3Normal);

    await scan("https://example.com", { silent: true });

    expect(vi.mocked(ora)).toHaveBeenCalledWith(
      expect.objectContaining({ isSilent: true }),
    );
  });

  it("passes isSilent false by default", async () => {
    vi.mocked(runReachabilityBridge).mockResolvedValue(mockBridge1Normal);
    vi.mocked(runStandardsBridge).mockResolvedValue(mockBridge2Normal);
    vi.mocked(runSeparationBridge).mockResolvedValue(mockBridge3Normal);

    await scan("https://example.com");

    expect(vi.mocked(ora)).toHaveBeenCalledWith(
      expect.objectContaining({ isSilent: false }),
    );
  });
});
