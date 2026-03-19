import { describe, it, expect } from "vitest";
import type { Check } from "../../core/types.js";
import { formatVerboseChecks } from "../format-verbose.js";

function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}

describe("formatVerboseChecks", () => {
  it("formats a passing check with checkmark symbol", () => {
    const checks: Check[] = [
      { id: "https", label: "HTTPS available", status: "pass" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).toContain("\u2714");
    expect(output).toContain("HTTPS available");
  });

  it("formats a failing check with x symbol", () => {
    const checks: Check[] = [
      { id: "robots", label: "robots.txt present", status: "fail" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).toContain("\u2718");
    expect(output).toContain("robots.txt present");
  });

  it("formats a partial check with warning symbol", () => {
    const checks: Check[] = [
      { id: "ccbot", label: "CCBot: partial", status: "partial" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).toContain("\u26A0");
    expect(output).toContain("CCBot: partial");
  });

  it("formats an error check with x symbol", () => {
    const checks: Check[] = [
      { id: "err", label: "Error check", status: "error" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).toContain("\u2718");
    expect(output).toContain("Error check");
  });

  it("includes detail text when provided", () => {
    const checks: Check[] = [
      {
        id: "http_status",
        label: "HTTP status",
        status: "pass",
        detail: "HTTP 200 OK",
      },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).toContain("HTTP 200 OK");
  });

  it("does not include extra text when no detail", () => {
    const checks: Check[] = [
      { id: "https", label: "HTTPS available", status: "pass" },
    ];
    const output = formatVerboseChecks(checks);
    // Should just have symbol + label, no parenthesized detail
    const stripped = stripAnsi(output);
    expect(stripped).not.toContain("(");
  });

  it("formats multiple checks on separate indented lines", () => {
    const checks: Check[] = [
      { id: "a", label: "Check A", status: "pass" },
      { id: "b", label: "Check B", status: "fail" },
      { id: "c", label: "Check C", status: "partial" },
    ];
    const output = formatVerboseChecks(checks);
    const lines = output.split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      // Each line should be indented (starts with spaces)
      expect(line).toMatch(/^\s{4}/);
    }
    const stripped = stripAnsi(output);
    expect(stripped).toContain("Check A");
    expect(stripped).toContain("Check B");
    expect(stripped).toContain("Check C");
  });
});
