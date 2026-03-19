import type { BridgeResult } from "../core/types.js";

export function createBridge4Stub(): BridgeResult {
  return {
    id: 4,
    name: "Schema",
    status: "not_evaluated",
    score: null,
    scoreLabel: null,
    checks: [],
    durationMs: 0,
    message:
      "Schema quality assessment requires deeper analysis beyond automated checks.",
  };
}

export function createBridge5Stub(): BridgeResult {
  return {
    id: 5,
    name: "Context",
    status: "not_evaluated",
    score: null,
    scoreLabel: null,
    checks: [],
    durationMs: 0,
    message:
      "Context evaluation requires deeper analysis beyond automated checks.",
  };
}
