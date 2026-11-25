import type { BridgeId, BridgeResult } from "../core/types.js";
import { cyan, dim, bold } from "./colors.js";
import { progressBar } from "./progress-bar.js";
import { terminalText } from "./terminal-text.js";

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
  if (bridge.status === "not_evaluated") {
    const reason = bridge.message ? " · " + terminalText(bridge.message) : "";
    return `  ${bold(bridgeLabel(bridge))}  ${dim("Skipped" + reason)}`;
  }
  if (bridge.id === 3) {
    const summary = terminalText(bridge.message ?? "Integration evidence unavailable");
    return `  ${bold(bridgeLabel(bridge))}  ${cyan(summary)}  ${dim(`(${bridge.durationMs}ms)`)}`;
  }
  if (bridge.score === null) return `  ${bold(bridgeLabel(bridge))}  ${dim("Unmeasured")}`;
  return formatScoredBridge(bridge, verbose);
}

function formatScoredBridge(bridge: BridgeResult, _verbose: boolean): string {
  const bar = progressBar(bridge.score as number);
  const label = bridgeLabel(bridge);
  const timing = dim(`(${bridge.durationMs}ms)`);
  const applicable = bridge.checks.filter(check => check.data?.policy !== "skip");
  const measured = applicable.filter(check => check.status !== "error").length;
  const coverage = measured < applicable.length ? dim(` · ${measured} of ${applicable.length} checks measured`) : "";
  return `  ${bold(label)}  ${bar}  ${bridge.score}  ${timing}${coverage}`;
}
