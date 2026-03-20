import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkg = require("../../../package.json") as {
  type: string;
  dependencies: Record<string, string>;
  exports: Record<string, { types: string; import: string }>;
  files: string[];
  bin: Record<string, string>;
  scripts: Record<string, string>;
};

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const distDir = join(projectRoot, "dist");

/**
 * Recursively walk a directory and return all file paths.
 */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(fullPath);
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

describe("packaging", () => {
  it("has exactly 3 runtime dependencies", () => {
    const deps = Object.keys(pkg.dependencies).sort();
    expect(deps).toEqual(["chalk", "commander", "ora"]);
  });

  it("is ESM-only", () => {
    expect(pkg.type).toBe("module");
  });

  it("has correct exports field", () => {
    const root = pkg.exports["."];
    expect(root).toBeDefined();
    expect(typeof root.types).toBe("string");
    expect(typeof root.import).toBe("string");
    expect(root.types).toMatch(/\.d\.ts$/);
    expect(root.import).toMatch(/\.js$/);
  });

  it("has files whitelist", () => {
    expect(pkg.files).toContain("dist");
  });

  it("has bin entry", () => {
    expect(pkg.bin.milieu).toBe("./dist/cli/index.js");
  });

  it("CLI entry has shebang", () => {
    const cliEntryPath = join(distDir, "cli", "index.js");
    const firstLine = readFileSync(cliEntryPath, "utf-8").split("\n")[0];
    expect(firstLine).toBe("#!/usr/bin/env node");
  });

  it("has prepublishOnly script", () => {
    expect(pkg.scripts.prepublishOnly).toBeDefined();
    expect(typeof pkg.scripts.prepublishOnly).toBe("string");
  });

  it("dist contains no test files", () => {
    const allPaths = walkDir(distDir);

    const testDirs = allPaths.filter((p) => p.includes("__tests__"));
    expect(testDirs).toHaveLength(0);

    const testFiles = allPaths.filter(
      (p) => p.endsWith(".test.js") || p.endsWith(".test.d.ts"),
    );
    expect(testFiles).toHaveLength(0);
  });
});
