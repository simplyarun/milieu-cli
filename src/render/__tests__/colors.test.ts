import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/;

function hasAnsi(text: string): boolean {
  return ANSI_REGEX.test(text);
}

describe("color functions (default, colors enabled)", () => {
  beforeEach(() => {
    vi.stubEnv("FORCE_COLOR", "1");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("green() returns string containing ANSI codes", async () => {
    const { green } = await import("../colors.js");
    expect(hasAnsi(green("hello"))).toBe(true);
  });

  it("yellow() returns string containing ANSI codes", async () => {
    const { yellow } = await import("../colors.js");
    expect(hasAnsi(yellow("hello"))).toBe(true);
  });

  it("red() returns string containing ANSI codes", async () => {
    const { red } = await import("../colors.js");
    expect(hasAnsi(red("hello"))).toBe(true);
  });

  it("cyan() returns string containing ANSI codes", async () => {
    const { cyan } = await import("../colors.js");
    expect(hasAnsi(cyan("hello"))).toBe(true);
  });

  it("dim() returns string containing ANSI codes", async () => {
    const { dim } = await import("../colors.js");
    expect(hasAnsi(dim("hello"))).toBe(true);
  });

  it("bold() returns string containing ANSI codes", async () => {
    const { bold } = await import("../colors.js");
    expect(hasAnsi(bold("hello"))).toBe(true);
  });

  it("all functions preserve the input text", async () => {
    const { green, yellow, red, cyan, dim, bold } = await import("../colors.js");
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
