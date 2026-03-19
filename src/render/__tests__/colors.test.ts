import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { green, yellow, red, cyan, dim, bold } from "../colors.js";

const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function hasAnsi(text: string): boolean {
  return ANSI_REGEX.test(text);
}

describe("color functions (default, colors enabled)", () => {
  it("green() returns string containing ANSI codes", () => {
    const result = green("hello");
    expect(hasAnsi(result)).toBe(true);
  });

  it("yellow() returns string containing ANSI codes", () => {
    const result = yellow("hello");
    expect(hasAnsi(result)).toBe(true);
  });

  it("red() returns string containing ANSI codes", () => {
    const result = red("hello");
    expect(hasAnsi(result)).toBe(true);
  });

  it("cyan() returns string containing ANSI codes", () => {
    const result = cyan("hello");
    expect(hasAnsi(result)).toBe(true);
  });

  it("dim() returns string containing ANSI codes", () => {
    const result = dim("hello");
    expect(hasAnsi(result)).toBe(true);
  });

  it("bold() returns string containing ANSI codes", () => {
    const result = bold("hello");
    expect(hasAnsi(result)).toBe(true);
  });

  it("all functions preserve the input text", () => {
    expect(green("hello")).toContain("hello");
    expect(yellow("hello")).toContain("hello");
    expect(red("hello")).toContain("hello");
    expect(cyan("hello")).toContain("hello");
    expect(dim("hello")).toContain("hello");
    expect(bold("hello")).toContain("hello");
  });
});

describe("with NO_COLOR=1", () => {
  beforeEach(() => {
    vi.stubEnv("NO_COLOR", "1");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("green returns plain text", async () => {
    const mod = await import("../colors.js");
    expect(mod.green("hello")).toBe("hello");
  });

  it("yellow returns plain text", async () => {
    const mod = await import("../colors.js");
    expect(mod.yellow("hello")).toBe("hello");
  });

  it("red returns plain text", async () => {
    const mod = await import("../colors.js");
    expect(mod.red("hello")).toBe("hello");
  });

  it("cyan returns plain text", async () => {
    const mod = await import("../colors.js");
    expect(mod.cyan("hello")).toBe("hello");
  });

  it("dim returns plain text", async () => {
    const mod = await import("../colors.js");
    expect(mod.dim("hello")).toBe("hello");
  });

  it("bold returns plain text", async () => {
    const mod = await import("../colors.js");
    expect(mod.bold("hello")).toBe("hello");
  });
});

describe("with NO_COLOR empty string", () => {
  beforeEach(() => {
    vi.stubEnv("NO_COLOR", "");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("colors remain enabled when NO_COLOR is empty", async () => {
    const mod = await import("../colors.js");
    expect(hasAnsi(mod.green("hello"))).toBe(true);
  });
});
