#!/usr/bin/env node
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scan } from "../core/scan.js";
import { compareReports } from "../core/diff.js";
import { validateScanOptions } from "../core/scan-options.js";
import type { ScanFailure } from "../core/types.js";
import { getVersion } from "../core/version.js";
import { readReport } from "./read-report.js";
import { formatReportDiff } from "../render/format-diff.js";
import { formatScanOutput } from "../render/format-scan.js";
import { terminalText } from "../render/terminal-text.js";

function writeFailure(error: ScanFailure["error"] | { kind: "diff_failed"; message: string }, jsonMode: boolean): void {
  if (jsonMode) {
    process.stdout.write(reportJson({ ok: false, error, version: getVersion() }) + "\n");
  } else {
    process.stderr.write(`Error: ${terminalText(error.message)}\n`);
  }
  process.exitCode = 1;
}

function reportJson(value: unknown, pretty = false): string {
  // JSON.stringify escapes C0 controls. Escape the remaining terminal controls
  // too, while keeping the decoded strings intact for programmatic consumers.
  return JSON.stringify(value, null, pretty ? 2 : undefined)
    .replace(/[\u007f-\u009f\p{Bidi_Control}\u2028\u2029]/gu, char =>
      "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
}

function numericFlag(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("milieu")
    .description("Measure how legible your product is to AI agents")
    .version(getVersion());

  program
    .command("scan")
    .description("Scan a URL for AI agent legibility")
    .argument("<url>", "URL to scan")
    .option("--json", "Output result as JSON")
    .option("--pretty", "Pretty-print JSON output (use with --json)")
    .option("--timeout <ms>", "Per-request timeout in milliseconds", "10000")
    .option("--max-concurrency <n>", "Maximum simultaneous outbound requests (default: 8)")
    .option("--max-requests <n>", "Maximum request attempts for the whole scan, counting redirects and retries (default: 150)")
    .option("--threshold <score>", "Exit non-zero if overall score is below this threshold (0 to 100)")
    .option("--require-complete", "Exit non-zero if the request budget ran out, a bridge was skipped, or a check errored")
    .option("--verbose", "Show individual check details")
    .option("--explain-all", "Show explanations on all checks, not just failures (use with --verbose)")
    .option("--quiet", "Suppress terminal output")
    .action(
      async (
        url: string,
        opts: Record<string, string | boolean | undefined>,
      ) => {
        const jsonMode = Boolean(opts.json);
        const quiet = Boolean(opts.quiet);
        const verbose = Boolean(opts.verbose);
        const explainAll = Boolean(opts.explainAll);
        const threshold = numericFlag(opts.threshold);
        const options = {
          timeout: numericFlag(opts.timeout),
          verbose,
          silent: jsonMode || quiet,
          maxConcurrency: numericFlag(opts.maxConcurrency),
          maxRequests: numericFlag(opts.maxRequests),
        };
        const optionError = validateScanOptions(options);
        if (optionError) return writeFailure({ kind: "scan_failed", message: optionError }, jsonMode);
        if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
          return writeFailure({ kind: "scan_failed", message: "--threshold requires a number between 0 and 100" }, jsonMode);
        }

        const outcome = await scan(url, options);
        if (!outcome.ok) {
          return writeFailure(outcome.error, jsonMode);
        }

        const result = outcome;

        if (jsonMode) {
          process.stdout.write(reportJson(result, Boolean(opts.pretty)) + "\n");
        } else if (!quiet) {
          console.log(formatScanOutput(result, verbose, explainAll));
        }

        if (threshold !== undefined && result.overallScore < threshold) {
          process.exitCode = 1;
        }
        if (opts.requireComplete && (result.incomplete || result.bridges.some(bridge =>
          bridge.status === "not_evaluated" || bridge.checks.some(check => check.status === "error")))) {
          process.exitCode = 1;
          if (!quiet && !jsonMode) process.stderr.write("Scan did not meet --require-complete. Review skipped bridges and errored checks.\n");
        }
      },
    );

  program.command("diff")
    .description("Compare two saved scan reports without making network requests")
    .argument("<base>", "Base scan JSON file")
    .argument("<candidate>", "Candidate scan JSON file")
    .option("--map-origin <base=candidate>", "Compare explicitly paired preview origins")
    .option("--markdown", "Render a Markdown job summary")
    .option("--json", "Output the comparison as JSON")
    .action(async (basePath: string, candidatePath: string, opts: { mapOrigin?: string; markdown?: boolean; json?: boolean }) => {
      try {
        if (opts.json && opts.markdown) throw new Error("Choose one of --markdown and --json");
        const pair = opts.mapOrigin?.split("=");
        if (pair && (pair.length !== 2 || !pair[0] || !pair[1])) {
          throw new Error("--map-origin requires base-origin=candidate-origin");
        }
        const [base, candidate] = await Promise.all([readReport(basePath), readReport(candidatePath)]);
        const diff = compareReports(base, candidate, { originMap: pair ? { base: pair[0], head: pair[1] } : undefined });
        process.stdout.write((opts.json ? reportJson(diff) : formatReportDiff(diff, Boolean(opts.markdown))) + "\n");
      } catch (error) {
        writeFailure({ kind: "diff_failed", message: error instanceof Error ? error.message : "Comparison failed" }, Boolean(opts.json));
      }
    });

  return program;
}

// Resolve npm bin symlinks. Embedded callers may have no script on disk.
let entry: string | undefined;
try {
  if (process.argv[1]) entry = realpathSync(process.argv[1]);
} catch {
  // No on-disk entry point.
}
if (entry === fileURLToPath(import.meta.url)) {
  await buildProgram().parseAsync(process.argv);
}
