import ora from "ora";
import type { ScanResult, ScanOutcome, ScanContext, ScanOptions, BridgeResult } from "./types.js";
import { normalizeUrl } from "../utils/index.js";
import {
  runReachabilityBridge, runStandardsBridge, runSeparationBridge,
  runSchemaBridge, runContextBridge,
} from "../bridges/index.js";
import { getVersion } from "./version.js";
import { runWithScanRequestContext, getScanRequestStats } from "../utils/http-client.js";

export async function scan(url: string, options: ScanOptions = {}): Promise<ScanOutcome> {
  const start = performance.now();
  const normalized = normalizeUrl(url);
  if (!normalized.ok) {
    return { ok: false, error: { kind: "invalid_url", message: `Invalid URL: ${url}` } };
  }
  const { domain, baseUrl } = normalized;

  const ctx: ScanContext = { url, domain, baseUrl, options, shared: {} };
  const isSilent = options.silent ?? false;
  const spinner = ora({ text: "Scanning...", color: "cyan", isSilent }).start();

  return runWithScanRequestContext(options, async () => {
  try {
    spinner.text = "Bridge 1: Reachability...";
    const bridge1 = await runReachabilityBridge(ctx);

    let bridge2: BridgeResult;
    let bridge3: BridgeResult;
    let bridge4: BridgeResult;
    let bridge5: BridgeResult;

    if (bridge1.abort) {
      spinner.text = "Scan aborted: " + (bridge1.abortReason ?? "unreachable");
      bridge2 = { id: 2, name: "Standards", status: "evaluated", score: 0, scoreLabel: "fail", checks: [], durationMs: 0 };
      bridge3 = { id: 3, name: "Separation", status: "evaluated", score: null, scoreLabel: null, checks: [], durationMs: 0 };
      bridge4 = { id: 4, name: "Schema", status: "evaluated", score: 0, scoreLabel: "fail", checks: [], durationMs: 0 };
      bridge5 = { id: 5, name: "Context", status: "evaluated", score: 0, scoreLabel: "fail", checks: [], durationMs: 0 };
    } else {
      spinner.text = "Bridge 2: Standards...";
      bridge2 = await runStandardsBridge(ctx);
      spinner.text = "Bridge 3: Separation...";
      bridge3 = await runSeparationBridge(ctx);
      spinner.text = "Bridges 4-5: Schema & Context...";
      [bridge4, bridge5] = await Promise.all([runSchemaBridge(ctx), runContextBridge(ctx)]);
    }

    const scoredBridges = [bridge1, bridge2, bridge3, bridge4, bridge5].filter(
      (b): b is BridgeResult & { score: number } => b.score !== null,
    );
    const overallScore = scoredBridges.length > 0
      ? Math.round(scoredBridges.reduce((sum, b) => sum + b.score, 0) / scoredBridges.length)
      : 0;
    const overallScoreLabel = overallScore >= 80 ? ("pass" as const) : overallScore >= 40 ? ("partial" as const) : ("fail" as const);

    const result: ScanResult = {
      ok: true,
      version: getVersion(), url, scannedOrigin: baseUrl, timestamp: new Date().toISOString(),
      durationMs: Math.round(performance.now() - start),
      overallScore, overallScoreLabel,
      incomplete: (getScanRequestStats()?.denied ?? 0) > 0,
      bridges: [bridge1, bridge2, bridge3, bridge4, bridge5],
    };

    spinner.stop();
    return result;
  } catch (err) {
    // Bridges are built on a never-throwing HTTP client, so this is a
    // defensive backstop: surface it as a failure outcome, never a throw.
    spinner.fail("Scan failed");
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: "scan_failed", message } };
  }
  });
}
