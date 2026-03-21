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

  it("shows why line for a failing check", () => {
    const checks: Check[] = [
      { id: "robots", label: "robots.txt", status: "fail", why: "Missing robots.txt" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).toContain("Missing robots.txt");
  });

  it("does NOT show why line for a passing check", () => {
    const checks: Check[] = [
      { id: "https", label: "HTTPS", status: "pass", why: "HTTPS is great" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).not.toContain("HTTPS is great");
  });

  it("shows why line for a partial check", () => {
    const checks: Check[] = [
      { id: "ccbot", label: "CCBot", status: "partial", why: "Partial crawl access" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).toContain("Partial crawl access");
  });

  it("shows why line for an error check", () => {
    const checks: Check[] = [
      { id: "err", label: "Error check", status: "error", why: "Something went wrong" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    expect(output).toContain("Something went wrong");
  });

  it("does not show why line when why is undefined", () => {
    const checks: Check[] = [
      { id: "robots", label: "robots.txt", status: "fail" },
    ];
    const output = formatVerboseChecks(checks);
    const lines = output.split("\n");
    // Only one line: the check line itself
    expect(lines).toHaveLength(1);
  });

  it("why line is indented 6 spaces", () => {
    const checks: Check[] = [
      { id: "robots", label: "robots.txt", status: "fail", why: "Missing robots.txt" },
    ];
    const output = stripAnsi(formatVerboseChecks(checks));
    const lines = output.split("\n");
    // Second line should be the why line, indented 6 spaces
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toMatch(/^\s{6}/);
    expect(lines[1]).toContain("Missing robots.txt");
  });
});
