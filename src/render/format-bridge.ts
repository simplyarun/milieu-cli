import type { BridgeResult } from "../core/types.js";
import { cyan, dim, bold } from "./colors.js";
import { progressBar } from "./progress-bar.js";

export function formatBridge(bridge: BridgeResult, verbose: boolean): string {
  if (bridge.status === "not_evaluated") {
    return formatStubBridge(bridge);
  }
  if (bridge.score !== null) {
    return formatScoredBridge(bridge, verbose);
  }
  return formatDetectionBridge(bridge, verbose);
}

function formatScoredBridge(bridge: BridgeResult, _verbose: boolean): string {
  const bar = progressBar(bridge.score as number);
  const label = `Bridge ${bridge.id}: ${bridge.name}`;
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
  const label = `Bridge ${bridge.id}: ${bridge.name}`;
  const timing = dim(`(${bridge.durationMs}ms)`);
  return `  ${bold(label)}  ${cyan(countText)}  ${timing}`;
}

function formatStubBridge(bridge: BridgeResult): string {
  return dim(`  Bridge ${bridge.id}: ${bridge.name}    not evaluated`);
}
