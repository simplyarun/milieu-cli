import ora from "ora";
import type {
  ScanResult,
  ScanContext,
  ScanOptions,
  BridgeResult,
} from "./types.js";
import { normalizeUrl } from "../utils/index.js";
import {
  runReachabilityBridge,
  runStandardsBridge,
  runSeparationBridge,
  createBridge4Stub,
  createBridge5Stub,
} from "../bridges/index.js";
import { getVersion } from "./version.js";

export async function scan(
  url: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const start = performance.now();

  // Normalize URL
  const normalized = normalizeUrl(url);
  if (!normalized.ok) {
    throw new Error(`Invalid URL: ${url}`);
  }
  const { domain, baseUrl } = normalized;

  const ctx: ScanContext = {
    url,
    domain,
    baseUrl,
    options,
    shared: {},
  };

  const isSilent = options.silent ?? false;
  const spinner = ora({ text: "Scanning...", color: "cyan", isSilent }).start();

  try {
    // Bridge 1: Reachability
    spinner.text = "Bridge 1: Reachability...";
    const bridge1 = await runReachabilityBridge(ctx);

    let bridge2: BridgeResult;
    let bridge3: BridgeResult;

    if (bridge1.abort) {
      // Fatal error -- skip remaining bridges
      spinner.text = "Scan aborted: " + (bridge1.abortReason ?? "unreachable");
      bridge2 = {
        id: 2,
        name: "Standards",
        status: "evaluated",
        score: 0,
        scoreLabel: "fail",
        checks: [],
        durationMs: 0,
      };
      bridge3 = {
        id: 3,
        name: "Separation",
        status: "evaluated",
        score: null,
        scoreLabel: null,
        checks: [],
        durationMs: 0,
      };
    } else {
      // Bridge 2: Standards
      spinner.text = "Bridge 2: Standards...";
      bridge2 = await runStandardsBridge(ctx);

      // Bridge 3: Separation
      spinner.text = "Bridge 3: Separation...";
      bridge3 = await runSeparationBridge(ctx);
    }

    // Bridges 4-5: Stubs
    const bridge4 = createBridge4Stub();
    const bridge5 = createBridge5Stub();

    // Calculate overall score (average of scored bridges where score is not null)
    const scoredBridges = [bridge1, bridge2, bridge3, bridge4, bridge5].filter(
      (b): b is BridgeResult & { score: number } => b.score !== null,
    );
    const overallScore =
      scoredBridges.length > 0
        ? Math.round(
            scoredBridges.reduce((sum, b) => sum + b.score, 0) /
              scoredBridges.length,
          )
        : 0;
    const overallScoreLabel =
      overallScore >= 80
        ? ("pass" as const)
        : overallScore >= 40
          ? ("partial" as const)
          : ("fail" as const);

    const result: ScanResult = {
      version: getVersion(),
      url,
      timestamp: new Date().toISOString(),
      durationMs: Math.round(performance.now() - start),
      overallScore,
      overallScoreLabel,
      bridges: [bridge1, bridge2, bridge3, bridge4, bridge5],
    };

    spinner.stop();
    return result;
  } catch (err) {
    spinner.fail("Scan failed");
    throw err;
  }
}
