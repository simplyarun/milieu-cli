import type { BridgeId, BridgeResult } from "../core/types.js";
import { cyan, dim, bold } from "./colors.js";
import { progressBar } from "./progress-bar.js";

const BRIDGE_QUESTIONS: Record<BridgeId, string> = {
  1: "Is my product surface accessible to AI agents?",
  2: "Does my product surface publish machine-readable standards?",
  3: "Does my product surface expose API infrastructure?",
  4: "Can agents use the APIs correctly?",
  5: "Can agents trust and leverage the context?",
};

function bridgeLabel(bridge: BridgeResult): string {
  return `${bridge.name}: ${BRIDGE_QUESTIONS[bridge.id]}`;
}

export function formatBridge(bridge: BridgeResult, verbose: boolean): string {
  if (bridge.score !== null) {
    return formatScoredBridge(bridge, verbose);
  }
  return formatDetectionBridge(bridge, verbose);
}

function formatScoredBridge(bridge: BridgeResult, _verbose: boolean): string {
  const bar = progressBar(bridge.score as number);
  const label = bridgeLabel(bridge);
  const timing = dim(`(${bridge.durationMs}ms)`);
  return `  ${bold(label)}  ${bar}  ${bridge.score}  ${timing}`;
}

function formatDetectionBridge(
  bridge: BridgeResult,
  _verbose: boolean,
): string {
  const detected = bridge.checks.filter((c) => c.status === "pass").length;
  const total = bridge.checks.length;
  const countText = `${detected} of ${total} signals detected`;
  const label = bridgeLabel(bridge);
  const timing = dim(`(${bridge.durationMs}ms)`);
  return `  ${bold(label)}  ${cyan(countText)}  ${timing}`;
}
