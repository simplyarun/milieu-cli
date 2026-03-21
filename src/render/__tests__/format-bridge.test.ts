import { describe, it, expect } from "vitest";
import type { BridgeResult } from "../../core/types.js";
import { formatBridge } from "../format-bridge.js";

function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}

describe("formatBridge", () => {
  it("formats a scored bridge with high score", () => {
    const bridge: BridgeResult = {
      id: 1,
      name: "Reachability",
      status: "evaluated",
      score: 85,
      scoreLabel: "pass",
      checks: [],
      durationMs: 230,
    };
    const output = stripAnsi(formatBridge(bridge, false));
    expect(output).toContain("Reachability: Is my site accessible to AI agents?");
    expect(output).toContain("85");
    expect(output).toContain("(230ms)");
  });

  it("formats a scored bridge with partial score", () => {
    const bridge: BridgeResult = {
      id: 2,
      name: "Standards",
      status: "evaluated",
      score: 42,
      scoreLabel: "partial",
      checks: [],
      durationMs: 1450,
    };
    const output = stripAnsi(formatBridge(bridge, false));
    expect(output).toContain("Standards: Does my site publish machine-readable standards?");
    expect(output).toContain("42");
    expect(output).toContain("(1450ms)");
  });

  it("formats a detection bridge with signal count", () => {
    const bridge: BridgeResult = {
      id: 3,
      name: "Separation",
      status: "evaluated",
      score: null,
      scoreLabel: null,
      checks: [
        { id: "api_presence", label: "API presence", status: "pass" },
        { id: "dev_docs", label: "Developer docs", status: "pass" },
        { id: "sdk_refs", label: "SDK references", status: "pass" },
        { id: "webhooks", label: "Webhook support", status: "fail" },
      ],
      durationMs: 320,
    };
    const output = stripAnsi(formatBridge(bridge, false));
    expect(output).toContain("Separation: Does my site expose API infrastructure?");
    expect(output).toContain("3 of 4 signals detected");
    expect(output).toContain("(320ms)");
  });

  it("formats a stub bridge (Bridge 4) as dim with no timing", () => {
    const bridge: BridgeResult = {
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
    const output = stripAnsi(formatBridge(bridge, false));
    expect(output).toContain("Schema: Can agents use the APIs correctly?");
    expect(output).toContain("not evaluated");
    expect(output).not.toContain("ms");
  });

  it("formats a stub bridge (Bridge 5) as dim with no timing", () => {
    const bridge: BridgeResult = {
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
    const output = stripAnsi(formatBridge(bridge, false));
    expect(output).toContain("Context: Can agents trust and leverage the context?");
    expect(output).toContain("not evaluated");
    expect(output).not.toContain("ms");
  });
});
