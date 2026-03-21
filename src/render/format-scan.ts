import type { ScanResult } from "../core/types.js";
import { green, yellow, red, bold, dim } from "./colors.js";
import { formatBridge } from "./format-bridge.js";
import { formatVerboseChecks } from "./format-verbose.js";

function formatTimestamp(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function formatTotalTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function scoreColorFn(
  label: "pass" | "partial" | "fail",
): (text: string) => string {
  if (label === "pass") return green;
  if (label === "partial") return yellow;
  return red;
}

export function formatScanOutput(
  result: ScanResult,
  verbose: boolean,
  explainAll = false,
): string {
  const lines: string[] = [];

  // Header
  const domain = result.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  lines.push(bold(`Milieu Scan: ${domain}`));
  lines.push(dim(`Scanned: ${formatTimestamp(result.timestamp)}`));
  lines.push("");

  // Bridges
  for (const bridge of result.bridges) {
    lines.push(formatBridge(bridge, verbose));
    if (verbose && bridge.checks.length > 0) {
      lines.push(formatVerboseChecks(bridge.checks, explainAll));
    }
  }

  lines.push("");

  // Overall score (colored by score label)
  const colorize = scoreColorFn(result.overallScoreLabel);
  const scoreLine = `Overall Score: ${colorize(String(result.overallScore))} (${result.overallScoreLabel})`;
  lines.push(bold(scoreLine));

  // Total time
  lines.push(dim(`Total: ${formatTotalTime(result.durationMs)}`));

  return lines.join("\n");
}
