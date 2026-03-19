import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { getVersion } from "../version.js";

const require = createRequire(import.meta.url);
const pkg = require("../../../package.json") as { version: string };

describe("getVersion", () => {
  it("returns a string matching semver pattern", () => {
    const version = getVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("returns value matching package.json version field", () => {
    const version = getVersion();
    expect(version).toBe(pkg.version);
  });

  it("returns same value on repeated calls (stable)", () => {
    const v1 = getVersion();
    const v2 = getVersion();
    const v3 = getVersion();
    expect(v1).toBe(v2);
    expect(v2).toBe(v3);
  });
});
