import { describe, it, expect } from "vitest";
import { progressBar } from "../progress-bar.js";
import { green, yellow, red } from "../colors.js";

const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

/** Extract the ANSI prefix (color code) from a styled string */
function ansiPrefix(text: string): string {
  const match = text.match(ANSI_REGEX);
  return match ? match[0] : "";
}

describe("progressBar", () => {
  it("progressBar(100) returns 12 visible characters", () => {
    const bar = progressBar(100);
    expect(stripAnsi(bar)).toHaveLength(12);
  });

  it("progressBar(0) returns 12 visible characters", () => {
    const bar = progressBar(0);
    expect(stripAnsi(bar)).toHaveLength(12);
  });

  it("progressBar(100) returns 12 filled characters", () => {
    const bar = progressBar(100);
    const visible = stripAnsi(bar);
    expect(visible).toBe("\u2588".repeat(12));
  });

  it("progressBar(0) returns 12 empty characters", () => {
    const bar = progressBar(0);
    const visible = stripAnsi(bar);
    expect(visible).toBe("\u2591".repeat(12));
  });

  it("progressBar(50) returns 6 filled + 6 empty", () => {
    const bar = progressBar(50);
    const visible = stripAnsi(bar);
    expect(visible).toBe("\u2588".repeat(6) + "\u2591".repeat(6));
  });

  it("progressBar(85) uses green coloring (score >= 80)", () => {
    const bar = progressBar(85);
    const greenRef = green("x");
    expect(ansiPrefix(bar)).toBe(ansiPrefix(greenRef));
  });

  it("progressBar(50) uses yellow coloring (40 <= score < 80)", () => {
    const bar = progressBar(50);
    const yellowRef = yellow("x");
    expect(ansiPrefix(bar)).toBe(ansiPrefix(yellowRef));
  });

  it("progressBar(20) uses red coloring (score < 40)", () => {
    const bar = progressBar(20);
    const redRef = red("x");
    expect(ansiPrefix(bar)).toBe(ansiPrefix(redRef));
  });

  it("progressBar(80) uses green (boundary: >= 80 is green)", () => {
    const bar = progressBar(80);
    const greenRef = green("x");
    expect(ansiPrefix(bar)).toBe(ansiPrefix(greenRef));
  });

  it("progressBar(40) uses yellow (boundary: >= 40 is yellow)", () => {
    const bar = progressBar(40);
    const yellowRef = yellow("x");
    expect(ansiPrefix(bar)).toBe(ansiPrefix(yellowRef));
  });

  it("progressBar(39) uses red (boundary: < 40 is red)", () => {
    const bar = progressBar(39);
    const redRef = red("x");
    expect(ansiPrefix(bar)).toBe(ansiPrefix(redRef));
  });
});
