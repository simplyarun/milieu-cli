#!/usr/bin/env node
import { Command } from "commander";
import { scan } from "../core/scan.js";
import { getVersion } from "../core/version.js";
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
    .option("--threshold <score>", "Exit non-zero if overall score below threshold")
    .option("--verbose", "Show individual check details")
    .option("--quiet", "Suppress terminal output")
    .action(
      async (
        url: string,
        opts: Record<string, string | boolean | undefined>,
      ) => {
        const jsonMode = Boolean(opts.json);
        const quiet = Boolean(opts.quiet);
        const verbose = Boolean(opts.verbose);
        const timeout = Number(opts.timeout) || 10_000;
        const threshold =
          opts.threshold !== undefined ? Number(opts.threshold) : undefined;

        try {
          const result = await scan(url, {
            timeout,
            verbose,
            silent: jsonMode || quiet,
          });

          if (jsonMode) {
            const output = opts.pretty
              ? JSON.stringify(result, null, 2)
              : JSON.stringify(result);
            process.stdout.write(output + "\n");
          } else if (!quiet) {
            console.log(formatScanOutput(result, verbose));
          }

          if (threshold !== undefined && result.overallScore < threshold) {
            process.exitCode = 1;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (jsonMode) {
            const errorObj = { error: message, version: getVersion() };
            process.stdout.write(JSON.stringify(errorObj) + "\n");
          } else {
            process.stderr.write(`Error: ${message}\n`);
          }
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
