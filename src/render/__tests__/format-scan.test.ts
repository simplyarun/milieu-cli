import { describe, it, expect } from "vitest";
import type { ScanResult } from "../../core/types.js";
import { formatScanOutput } from "../format-scan.js";

function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}

const mockScanResult: ScanResult = {
  version: "0.1.0",
  url: "https://example.com",
  timestamp: "2026-03-18T14:30:00.000Z",
  durationMs: 2100,
  overallScore: 74,
  overallScoreLabel: "partial",
  bridges: [
    {
      id: 1,
      name: "Reachability",
      status: "evaluated",
      score: 85,
      scoreLabel: "pass",
      checks: [
        { id: "https", label: "HTTPS available", status: "pass" },
        {
          id: "http_status",
          label: "HTTP status 200",
          status: "pass",
          detail: "HTTP 200 OK",
        },
      ],
      durationMs: 230,
    },
    {
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
    },
    {
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
    },
    {
      id: 4,
      name: "Schema",
      status: "not_evaluated",
      score: null,
      scoreLabel: null,
      checks: [],
      durationMs: 0,
      message:
        "Schema quality assessment requires deeper analysis beyond automated checks.",
    },
    {
      id: 5,
      name: "Context",
      status: "not_evaluated",
      score: null,
      scoreLabel: null,
      checks: [],
      durationMs: 0,
      message:
        "Context evaluation requires deeper analysis beyond automated checks.",
    },
  ],
};

describe("formatScanOutput", () => {
  it("TERM-01: contains all 5 bridges", () => {
    const output = stripAnsi(formatScanOutput(mockScanResult, false));
    expect(output).toContain("Reachability:");
    expect(output).toContain("Standards:");
    expect(output).toContain("Separation:");
    expect(output).toContain("Schema:");
    expect(output).toContain("Context:");
  });

  it("TERM-06: formats timestamp as YYYY-MM-DD HH:mm:ss (not raw ISO)", () => {
    const output = stripAnsi(formatScanOutput(mockScanResult, false));
    expect(output).toContain("2026-03-18 14:30:00");
    expect(output).not.toContain("2026-03-18T14:30:00");
  });

  it("TERM-07: shows per-bridge timing", () => {
    const output = stripAnsi(formatScanOutput(mockScanResult, false));
    expect(output).toContain("(230ms)");
    expect(output).toContain("(1450ms)");
    expect(output).toContain("(320ms)");
  });

  it("shows header with domain", () => {
    const output = stripAnsi(formatScanOutput(mockScanResult, false));
    const firstLine = output.split("\n")[0];
    expect(firstLine).toContain("Milieu Scan:");
    expect(firstLine).toContain("example.com");
  });

  it("shows overall score and label", () => {
    const output = stripAnsi(formatScanOutput(mockScanResult, false));
    expect(output).toContain("74");
    expect(output).toContain("partial");
  });

  it("shows total time formatted", () => {
    const output = stripAnsi(formatScanOutput(mockScanResult, false));
    expect(output).toContain("2.1s");
  });

  it("verbose=false does not show individual check labels", () => {
    const output = stripAnsi(formatScanOutput(mockScanResult, false));
    expect(output).not.toContain("HTTPS available");
    expect(output).not.toContain("OpenAPI spec");
    expect(output).not.toContain("API presence");
  });

  it("verbose=true shows individual check labels", () => {
    const output = stripAnsi(formatScanOutput(mockScanResult, true));
    expect(output).toContain("HTTPS available");
    expect(output).toContain("HTTP status 200");
    expect(output).toContain("OpenAPI spec");
    expect(output).toContain("llms.txt");
    expect(output).toContain("API presence");
    expect(output).toContain("Developer docs");
  });
});
