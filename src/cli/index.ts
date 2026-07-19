#!/usr/bin/env node
import { Command } from "commander";
import { scan } from "../core/scan.js";
import { getVersion } from "../core/version.js";
import { resolveExplanation } from "../core/explanations.js";
import { formatScanOutput } from "../render/format-scan.js";

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
    .option("--threshold <score>", "Exit non-zero if overall score below threshold")
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
        const timeout = Number(opts.timeout) || 10_000;
        const threshold =
          opts.threshold !== undefined ? Number(opts.threshold) : undefined;
        const maxConcurrency =
          opts.maxConcurrency !== undefined ? Number(opts.maxConcurrency) : undefined;
        const maxRequests =
          opts.maxRequests !== undefined ? Number(opts.maxRequests) : undefined;

        // A zero/negative/NaN limit would deadlock or disable the budget.
        for (const [flag, value] of [
          ["--max-concurrency", maxConcurrency],
          ["--max-requests", maxRequests],
        ] as const) {
          if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
            process.stderr.write(`Error: ${flag} requires a positive integer\n`);
            process.exitCode = 1;
            return;
          }
        }

        // scan() never throws — it returns a discriminated outcome.
        const outcome = await scan(url, {
          timeout,
          verbose,
          silent: jsonMode || quiet,
          maxConcurrency,
          maxRequests,
        });

        if (!outcome.ok) {
          if (jsonMode) {
            process.stdout.write(
              JSON.stringify({ ok: false, error: outcome.error, version: getVersion() }) + "\n",
            );
          } else {
            process.stderr.write(`Error: ${outcome.error.message}\n`);
          }
          process.exitCode = 1;
          return;
        }

        const result = outcome;

        // Attach "why this matters" explanations to each check
        for (const bridge of result.bridges) {
          for (const check of bridge.checks) {
            check.why = resolveExplanation(check.id, check.status);
          }
        }

        if (jsonMode) {
          const output = opts.pretty
            ? JSON.stringify(result, null, 2)
            : JSON.stringify(result);
          process.stdout.write(output + "\n");
        } else if (!quiet) {
          console.log(formatScanOutput(result, verbose, explainAll));
        }

        if (threshold !== undefined && result.overallScore < threshold) {
          process.exitCode = 1;
        }
      },
    );

  return program;
}

// Run when executed directly — resolves symlinks so npx works
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

try {
  const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
  if (entry === fileURLToPath(import.meta.url)) {
    const program = buildProgram();
    await program.parseAsync(process.argv);
  }
} catch {
  // Not the main module (e.g., imported for testing)
}
