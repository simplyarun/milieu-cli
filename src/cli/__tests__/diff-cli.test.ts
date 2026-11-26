import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../index.js";
import { readReport } from "../read-report.js";

function scanReport(origin = "https://base.example") {
  const bridges = ["Reachability", "Standards", "Separation", "Schema", "Context"].map((name, i) => ({
    id: i + 1, name, status: "evaluated", score: i === 2 ? null : 50,
    scoreLabel: i === 2 ? null : "partial", durationMs: 1, checks: [] as unknown[],
  }));
  return { ok: true, version: "0.4.0-rc.0", scannedOrigin: origin, url: origin, incomplete: false,
    timestamp: "2026-01-01T00:00:00Z", durationMs: 5, overallScore: 50, overallScoreLabel: "partial", bridges };
}

async function runDiff(...args: string[]): Promise<string> {
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await buildProgram().exitOverride().parseAsync(["node", "milieu", "diff", ...args]);
  return stdout.mock.calls.map(([chunk]) => String(chunk)).join("");
}

describe("offline diff command", () => {
  let directory: string;
  let savedExitCode: typeof process.exitCode;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "milieu-diff-"));
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = savedExitCode;
    await rm(directory, { recursive: true, force: true });
  });

  it("reads both files, pairs preview origins, and renders literal Markdown for a changed check", async () => {
    const base = scanReport();
    const head = scanReport("https://head.example");
    const label = "sample-private-label " + String.fromCharCode(96).repeat(6) + "\n\u202e example";
    base.bridges[0].checks.push({ id: "http_status", label, status: "pass", detail: "HTTP 200 OK", data: { statusCode: 200 } });
    head.bridges[0].checks.push({ id: "http_status", label, status: "fail", detail: "HTTP 404: sample-private-detail", data: { statusCode: 404 } });
    const [a, b] = ["a.json", "b.json"].map(f => join(directory, f));
    await Promise.all([writeFile(a, JSON.stringify(base)), writeFile(b, JSON.stringify(head))]);
    const output = await runDiff(a, b, "--markdown", "--map-origin", base.scannedOrigin + "=" + head.scannedOrigin);
    expect(output).toContain("Bridge 1 · Reachability · regression");
    expect(output).toContain("http_status\npass → fail");
    expect(output).not.toMatch(/sample-private|\u202e/);
    expect(output).toContain(head.scannedOrigin);
    expect(process.exitCode).toBeUndefined();
  });

  it("publishes structured auth, contract and package evidence while omitting private report fields", async () => {
    const base = scanReport();
    const head = scanReport();
    const origin = base.scannedOrigin;
    const contract = origin + "/contract/v1.json";
    for (const r of [base, head]) {
      const first = r === base;
      r.url += "/?sample-private-input";
      r.version = "0.4.0-sample-private-version";
      for (const [bridgeIndex, id, data] of [
        [1, "openapi_spec", { documentUrl: contract }],
        [2, "api_presence", { descriptionSource: contract, routeEvidence: { complete: true, capabilities: [{
          id: "openapi-description", label: "sample-private-capability", routes: first ? [{ source: origin + "/docs", target: contract }] : [],
        }] } }],
        [2, "sdk_references", { packageLinks: first ? ["https://www.npmjs.com/package/@sample/cli", "https://sample-private.example/ordinary"] : [],
          packageLinkPages: [origin + "/"], packageLinksComplete: true }],
        [2, "developer_docs", { linkedUrls: first ? [origin + "/docs?sample-private-query", origin + "/docs#sample-private-fragment",
          "https://sample-private-user@base.example/docs"] : [], fetchedUrls: first ? [origin + "/guides",
          origin + "/docs/%3Fsample-private-encoded", origin + "/docs/A%20sample-private-note"] : [], linksMeasured: true, fetchesComplete: true }],
        [4, "context_auth_legibility", { httpStatus: 401, method: "GET", probeSource: "protected_operation", responseUrl: origin + "/orders",
          probeUrl: origin + "/orders", measurement: "challenged", signals: first ? ["www-authenticate", "json_error_body"] : ["json_error_body"] }],
        [4, "context_rate_limit_headers", { httpStatus: first ? 200 : 429, method: "GET", probeSource: "operation",
          measurement: "measured", probeUrl: origin + "/items", responseUrl: origin + "/items", headerFound: "sample-private-header" }],
      ] as const) {
        r.bridges[bridgeIndex].checks.push({ id, status: "pass", label: "sample-private-label", detail: "sample-private-detail", data });
      }
      r.bridges[1].checks.push({ id: "sample-private-check-id", status: first ? "pass" : "partial", label: "sample-private-label" });
    }
    const [a, b] = ["a.json", "b.json"].map(f => join(directory, f));
    await Promise.all([writeFile(a, JSON.stringify(base)), writeFile(b, JSON.stringify(head))]);
    const output = await runDiff(a, b, "--markdown");
    expect(output).toContain("Published routes to the OpenAPI contract: 1 → 0");
    expect(output).toContain("Target     /contract/v1.json");
    expect(output).toContain("Package registry link: observed → not observed");
    expect(output).toContain("https://www.npmjs.com/package/@sample/cli");
    expect(output).toContain("WWW-Authenticate");
    expect(output).toContain("Target     /orders");
    expect(output).toContain("Target     /guides");
    expect(output).toContain("Homepage link coverage: unavailable → complete");
    expect(output).toContain("Comparable rate-limit evidence was not established.");
    expect(output).toContain("Target     /items");
    expect(output).toContain("Unrecognized check");
    expect(output).not.toContain("sample-private");
    expect(output.endsWith(String.fromCharCode(96).repeat(3) + "\n")).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it("shows the direction of a skipped bridge without copying its abort reason", async () => {
    const base = scanReport();
    const head = scanReport();
    Object.assign(head.bridges[3], { status: "not_evaluated", score: null, scoreLabel: null, abortReason: "private abort details" });
    const [a, b] = ["a.json", "b.json"].map(f => join(directory, f));
    await Promise.all([writeFile(a, JSON.stringify(base)), writeFile(b, JSON.stringify(head))]);
    const output = await runDiff(a, b, "--markdown");
    expect(output).toContain("Bridge coverage: schema unverified → not evaluated");
    expect(output).not.toContain("private abort details");
  });

  it("bounds the complete Markdown summary by UTF-8 bytes and reports the exact omitted count", async () => {
    const count = 3500;
    const links = Array.from({ length: count }, (_, i) => "https://base.example/docs/reference/operation-" + i);
    const reports = [scanReport(), scanReport()];
    for (const [i, r] of reports.entries()) {
      r.bridges[2].checks.push({ id: "developer_docs", label: "Developer documentation", status: "pass",
        data: { linkedUrls: i === 0 ? links : [], fetchedUrls: [], linksMeasured: true, fetchesComplete: true } });
      r.bridges[4].checks.push({ id: "context_versioning_signal", label: "Versioning", status: i === 0 ? "pass" : "partial" });
    }
    const [a, b] = ["base.json", "candidate.json"].map(f => join(directory, f));
    await Promise.all([writeFile(a, JSON.stringify(reports[0])), writeFile(b, JSON.stringify(reports[1]))]);
    const output = await runDiff(a, b, "--markdown");
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(256 * 1024);
    const omitted = Number(output.match(/(\d+) additional findings omitted/)?.[1]);
    expect(omitted).toBeGreaterThan(0);
    expect(omitted + (output.match(/Homepage documentation link:/g)?.length ?? 0)).toBe(count);
    expect(output).toContain("context_versioning_signal");
  });

  it.each([
    ["incomplete JSON", "{", "invalid JSON"],
    ["unsuccessful scan", '{"ok":false}', "failed scan"],
    ["unknown shape", "{}", "five-bridge"],
  ])("reports %s as a machine-readable input error", async (_, input, message) => {
    const path = join(directory, "scan.json");
    await writeFile(path, input);
    const failure = JSON.parse(await runDiff(path, path, "--json"));
    expect(failure).toMatchObject({ ok: false, error: { kind: "diff_failed" } });
    expect(failure.error.message).toContain(message);
    expect(process.exitCode).toBe(1);
  });

  it("reads JSON saved with a Unicode byte-order mark by an editor or shell", async () => {
    const report = scanReport();
    const json = JSON.stringify(report);
    for (const bytes of [Buffer.from("\uFEFF" + json), Buffer.from("\uFEFF" + json, "utf16le"), Buffer.from("\uFEFF" + json, "utf16le").swap16()]) {
      const path = join(directory, "saved.json");
      await writeFile(path, bytes);
      expect(await readReport(path)).toEqual(report);
    }
  });

  it("rejects duplicate check IDs and non-file inputs", async () => {
    const report = scanReport();
    const check = { id: "https", label: "HTTPS", status: "pass" };
    report.bridges[0].checks.push(check, check);
    const path = join(directory, "duplicate.json");
    await writeFile(path, JSON.stringify(report));
    await expect(readReport(path)).rejects.toThrow(/duplicate check/);
    await expect(readReport(directory)).rejects.toThrow(/regular JSON file/);
  });
});
