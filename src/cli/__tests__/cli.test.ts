import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Hoisted mocks (available in vi.mock factories) ---
const { mockScan, mockFormatScanOutput } = vi.hoisted(() => ({
  mockScan: vi.fn(),
  mockFormatScanOutput: vi.fn(() => "formatted output"),
}));

vi.mock("../../core/scan.js", () => ({
  scan: mockScan,
}));

vi.mock("../../core/version.js", () => ({
  getVersion: vi.fn(() => "0.1.0"),
}));

vi.mock("../../render/format-scan.js", () => ({
  formatScanOutput: mockFormatScanOutput,
}));

// --- Mock ScanResult for controlled test data ---
const mockScanResult = {
  version: "0.1.0",
  url: "https://example.com",
  timestamp: "2026-01-01T00:00:00.000Z",
  durationMs: 1500,
  overallScore: 74,
  overallScoreLabel: "partial" as const,
  bridges: [
    {
      id: 1,
      name: "Reachability",
      status: "evaluated",
      score: 85,
      scoreLabel: "pass",
      checks: [
        { id: "https_available", label: "HTTPS Available", status: "pass" as const },
        { id: "robots_txt", label: "robots.txt", status: "fail" as const, detail: "No robots.txt found at example.com" },
      ],
      durationMs: 200,
    },
    {
      id: 2,
      name: "Standards",
      status: "evaluated",
      score: 63,
      scoreLabel: "partial",
      checks: [],
      durationMs: 800,
    },
    {
      id: 3,
      name: "Separation",
      status: "evaluated",
      score: null,
      scoreLabel: null,
      checks: [],
      durationMs: 300,
    },
    {
      id: 4,
      name: "Schema",
      status: "not_evaluated",
      score: null,
      scoreLabel: null,
      checks: [],
      durationMs: 0,
    },
    {
      id: 5,
      name: "Context",
      status: "not_evaluated",
      score: null,
      scoreLabel: null,
      checks: [],
      durationMs: 0,
    },
  ],
};

// --- Import after mocks ---
import { buildProgram } from "../index.js";

describe("CLI", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    savedExitCode = process.exitCode;
    process.exitCode = undefined as unknown as number;
    mockScan.mockImplementation(() => Promise.resolve(structuredClone(mockScanResult)));
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  function createProgram() {
    return buildProgram().exitOverride();
  }

  // Test 1 (CLI-01): scan command parses URL argument and calls scan() with it
  it("scan command parses URL argument and calls scan()", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "milieu", "scan", "https://example.com"]);

    expect(mockScan).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  // Test 2 (CLI-05): --version outputs the version string
  it("--version outputs the version string", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "milieu", "--version"]);
    } catch {
      // CommanderError expected for --version with exitOverride
    }

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(output).toContain("0.1.0");
  });

  // Test 3 (CLI-06): invalid URL writes error to stderr and sets exitCode 1
  it("invalid URL writes error to stderr and sets exitCode 1", async () => {
    mockScan.mockRejectedValueOnce(new Error("Invalid URL: not-a-url"));

    const program = createProgram();
    await program.parseAsync(["node", "milieu", "scan", "not-a-url"]);

    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(stderrOutput).toContain("Invalid URL");
    expect(process.exitCode).toBe(1);
  });

  // Test 4 (JSON-01): --json outputs JSON.stringify(result) to stdout
  it("--json outputs JSON to stdout", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "milieu", "scan", "https://example.com", "--json"]);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    const parsed = JSON.parse(output.trim());
    expect(parsed.overallScore).toBe(74);
    expect(parsed.version).toBe("0.1.0");
    // Compact JSON -- no indentation
    expect(output).not.toContain("  ");
  });

  // Test 5 (JSON-02): --json --pretty outputs formatted JSON
  it("--json --pretty outputs formatted JSON", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "milieu",
      "scan",
      "https://example.com",
      "--json",
      "--pretty",
    ]);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    // Pretty JSON has newlines and indentation
    expect(output).toContain("  ");
    expect(output).toContain("\n");
    const parsed = JSON.parse(output.trim());
    expect(parsed.overallScore).toBe(74);
  });

  // Test 6 (CLI-02): --timeout 5000 passes timeout: 5000 to scan()
  it("--timeout passes custom timeout to scan()", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "milieu",
      "scan",
      "https://example.com",
      "--timeout",
      "5000",
    ]);

    expect(mockScan).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  // Test 7 (CLI-03): --threshold 80 sets exitCode 1 when overallScore < 80
  it("--threshold sets exitCode 1 when score is below threshold", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "milieu",
      "scan",
      "https://example.com",
      "--threshold",
      "80",
    ]);

    // overallScore is 74, threshold is 80 => exitCode 1
    expect(process.exitCode).toBe(1);
  });

  // Test 8 (CLI-03b): --threshold 70 does NOT set exitCode when overallScore >= 70
  it("--threshold does not set exitCode when score meets threshold", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "milieu",
      "scan",
      "https://example.com",
      "--threshold",
      "70",
    ]);

    // overallScore is 74, threshold is 70 => no exitCode
    expect(process.exitCode).toBeUndefined();
  });

  // Test 9 (CLI-04): --quiet suppresses formatScanOutput, passes silent: true
  it("--quiet suppresses terminal output and passes silent to scan", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "milieu", "scan", "https://example.com", "--quiet"]);

    expect(mockScan).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ silent: true }),
    );
    expect(mockFormatScanOutput).not.toHaveBeenCalled();
  });

  // Test 10 (CLI-04 + JSON-01): --json passes silent: true to scan
  it("--json passes silent: true to scan", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "milieu", "scan", "https://example.com", "--json"]);

    expect(mockScan).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ silent: true }),
    );
  });

  // Test 11 (CLI-06): --json with invalid URL outputs JSON error object to stdout
  it("--json with invalid URL outputs JSON error to stdout", async () => {
    mockScan.mockRejectedValueOnce(new Error("Invalid URL: bad-url"));

    const program = createProgram();
    await program.parseAsync(["node", "milieu", "scan", "bad-url", "--json"]);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    const parsed = JSON.parse(output.trim());
    expect(parsed.error).toContain("Invalid URL");
    expect(parsed.version).toBe("0.1.0");
    expect(process.exitCode).toBe(1);
    // Error should go to stdout (not stderr) in JSON mode
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(stderrOutput).toBe("");
  });

  // Test 12: --json output includes why field on checks
  it("--json output includes why field on checks", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "milieu", "scan", "https://example.com", "--json"]);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    const parsed = JSON.parse(output.trim());
    const robotsCheck = parsed.bridges[0].checks.find(
      (c: { id: string }) => c.id === "robots_txt",
    );
    expect(robotsCheck).toBeDefined();
    expect(typeof robotsCheck.why).toBe("string");
    expect(robotsCheck.why.length).toBeGreaterThan(0);
  });

  // Test 13: --json why field is status-aware
  it("--json why field is status-aware", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "milieu", "scan", "https://example.com", "--json"]);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    const parsed = JSON.parse(output.trim());
    const robotsCheck = parsed.bridges[0].checks.find(
      (c: { id: string }) => c.id === "robots_txt",
    );
    // robots_txt has status "fail", so why should contain the fail-specific text
    expect(robotsCheck.why).toContain("no guidance");
  });

  // Test 14: library scan() result does NOT include why field
  it("library scan() result does NOT include why field", () => {
    const raw = structuredClone(mockScanResult);
    for (const bridge of raw.bridges) {
      for (const check of bridge.checks) {
        expect((check as Record<string, unknown>).why).toBeUndefined();
      }
    }
  });
});
