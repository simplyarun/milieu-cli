import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks for use inside vi.mock factories (vitest hoists vi.mock calls)
const { mockSpinner, mockRunReachability, mockRunStandards, mockRunSeparation } =
  vi.hoisted(() => ({
    mockSpinner: {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn(),
      fail: vi.fn(),
      text: "",
    },
    mockRunReachability: vi.fn(),
    mockRunStandards: vi.fn(),
    mockRunSeparation: vi.fn(),
  }));

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner),
}));

// Mock bridge runners
vi.mock("../../bridges/index.js", () => ({
  runReachabilityBridge: mockRunReachability,
  runStandardsBridge: mockRunStandards,
  runSeparationBridge: mockRunSeparation,
  runSchemaBridge: vi.fn(() => ({
    id: 4,
    name: "Schema",
    status: "evaluated",
    score: 50,
    scoreLabel: "partial",
    checks: [],
    durationMs: 100,
  })),
  runContextBridge: vi.fn(() => ({
    id: 5,
    name: "Context",
    status: "evaluated",
    score: 30,
    scoreLabel: "partial",
    checks: [],
    durationMs: 80,
  })),
}));

// Mock version
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
}));

import { scan, getVersion } from "../index.js";
import type {
  CheckStatus,
  Check,
  BridgeResult,
  ScanResult,
  ScanOptions,
} from "../types.js";

// Standard mock bridge results for reuse across tests
const bridge1Result: BridgeResult = {
  id: 1,
  name: "Reachability",
  status: "evaluated",
  score: 80,
  scoreLabel: "pass",
  checks: [
    { id: "https", label: "HTTPS available", status: "pass" },
    { id: "http_status", label: "HTTP status 200", status: "pass" },
  ],
  durationMs: 150,
};

const bridge2Result: BridgeResult = {
  id: 2,
  name: "Standards",
  status: "evaluated",
  score: 60,
  scoreLabel: "partial",
  checks: [
    { id: "openapi", label: "OpenAPI spec", status: "pass" },
    { id: "llms_txt", label: "llms.txt", status: "fail" },
  ],
  durationMs: 300,
};

const bridge3Result: BridgeResult = {
  id: 3,
  name: "Separation",
  status: "evaluated",
  score: null,
  scoreLabel: null,
  checks: [
    { id: "api_presence", label: "API presence", status: "pass" },
  ],
  durationMs: 200,
};

function setupNormalBridges(): void {
  mockRunReachability.mockResolvedValue(bridge1Result);
  mockRunStandards.mockResolvedValue(bridge2Result);
  mockRunSeparation.mockResolvedValue(bridge3Result);
}

describe("Programmatic API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpinner.text = "";
    mockSpinner.start.mockReturnThis();
  });

  describe("exports", () => {
    it("exports scan as an async function", () => {
      expect(typeof scan).toBe("function");
    });

    it("exports getVersion as a function", () => {
      expect(typeof getVersion).toBe("function");
    });
  });

  describe("scan() return shape (API-01)", () => {
    it("returns ScanResult with all required fields", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com");

      expect(result).toHaveProperty("version");
      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("durationMs");
      expect(result).toHaveProperty("overallScore");
      expect(result).toHaveProperty("overallScoreLabel");
      expect(result).toHaveProperty("bridges");

      expect(typeof result.version).toBe("string");
      expect(typeof result.url).toBe("string");
      expect(typeof result.timestamp).toBe("string");
      expect(typeof result.durationMs).toBe("number");
      expect(typeof result.overallScore).toBe("number");
      expect(typeof result.overallScoreLabel).toBe("string");
      expect(Array.isArray(result.bridges)).toBe(true);
    });

    it("bridges is a 5-element tuple", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com");

      expect(result.bridges).toHaveLength(5);
      expect(result.bridges[0].id).toBe(1);
      expect(result.bridges[1].id).toBe(2);
      expect(result.bridges[2].id).toBe(3);
      expect(result.bridges[3].id).toBe(4);
      expect(result.bridges[4].id).toBe(5);
    });

    it("each bridge has required BridgeResult shape", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com");

      for (const bridge of result.bridges) {
        expect(bridge).toHaveProperty("id");
        expect(bridge).toHaveProperty("name");
        expect(bridge).toHaveProperty("status");
        expect(bridge).toHaveProperty("score");
        expect(bridge).toHaveProperty("scoreLabel");
        expect(bridge).toHaveProperty("checks");
        expect(bridge).toHaveProperty("durationMs");
        expect(typeof bridge.id).toBe("number");
        expect(typeof bridge.name).toBe("string");
        expect(typeof bridge.status).toBe("string");
        expect(Array.isArray(bridge.checks)).toBe(true);
        expect(typeof bridge.durationMs).toBe("number");
      }
    });

    it("overallScore is a number 0-100", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com");

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it("overallScoreLabel is pass, partial, or fail", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com");

      expect(["pass", "partial", "fail"]).toContain(result.overallScoreLabel);
    });
  });

  describe("scan() options (API-02)", () => {
    it("accepts timeout option", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com", { timeout: 5000 });

      // Verify scan completed -- timeout was accepted without error
      expect(result.version).toBe("0.1.0");

      // Verify timeout was passed through to the context
      const ctx = mockRunReachability.mock.calls[0][0];
      expect(ctx.options.timeout).toBe(5000);
    });

    it("accepts verbose option", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com", { verbose: true });

      expect(result.version).toBe("0.1.0");

      const ctx = mockRunReachability.mock.calls[0][0];
      expect(ctx.options.verbose).toBe(true);
    });

    it("accepts silent option", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com", { silent: true });

      expect(result.version).toBe("0.1.0");

      const ctx = mockRunReachability.mock.calls[0][0];
      expect(ctx.options.silent).toBe(true);
    });

    it("all options are optional -- scan(url) works with no options", async () => {
      setupNormalBridges();
      const result = await scan("https://example.com");

      expect(result.version).toBe("0.1.0");
      expect(result.bridges).toHaveLength(5);
    });
  });

  describe("type exports (API-03)", () => {
    it("CheckStatus, Check, BridgeResult, ScanResult, ScanOptions are usable as type annotations", () => {
      // These type annotations prove the types are importable from the core barrel.
      // If this file compiles, API-03 is satisfied.
      const status: CheckStatus = "pass";
      const check: Check = { id: "test", label: "Test Check", status: "pass" };
      const options: ScanOptions = { timeout: 5000, verbose: true };
      const bridgeResult: BridgeResult = { ...bridge1Result };
      const scanResult: ScanResult = {
        version: "0.1.0",
        url: "https://example.com",
        timestamp: new Date().toISOString(),
        durationMs: 100,
        overallScore: 70,
        overallScoreLabel: "partial",
        bridges: [
          bridge1Result,
          bridge2Result,
          bridge3Result,
          { ...bridge1Result, id: 4, name: "Schema", status: "not_evaluated", score: null, scoreLabel: null },
          { ...bridge1Result, id: 5, name: "Context", status: "not_evaluated", score: null, scoreLabel: null },
        ],
      };

      expect(status).toBe("pass");
      expect(check.id).toBe("test");
      expect(options.timeout).toBe(5000);
      expect(bridgeResult.id).toBe(1);
      expect(scanResult.overallScoreLabel).toBe("partial");
    });
  });
});
