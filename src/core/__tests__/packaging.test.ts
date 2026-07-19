import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
// The two tests below inspect build output. On a fresh checkout `dist/` may
// not exist yet (`npm test` has no build step), so they skip rather than fail
// with ENOENT. `npm run build && npm test` exercises them fully.
const hasDist = existsSync(distDir);

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
  it("has exactly 4 runtime dependencies", () => {
    // undici backs SSRF connection pinning (see SECURITY.md); the rest are CLI/render.
    const deps = Object.keys(pkg.dependencies).sort();
    expect(deps).toEqual(["chalk", "commander", "ora", "undici"]);
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

  it("has bin entries without a ./ prefix (npm >=11 strips ./-prefixed bins)", () => {
    // npm 11 rejects "./dist/..." as an invalid bin and drops the entry,
    // which would silently break `npx milieu-cli` / the global command.
    expect(pkg.bin.milieu).toBe("dist/cli/index.js");
    expect(pkg.bin["milieu-cli"]).toBe("dist/cli/index.js");
  });

  it.skipIf(!hasDist)("CLI entry has shebang", () => {
    const cliEntryPath = join(distDir, "cli", "index.js");
    const firstLine = readFileSync(cliEntryPath, "utf-8").split("\n")[0];
    expect(firstLine).toBe("#!/usr/bin/env node");
  });

  it("has prepublishOnly script", () => {
    expect(pkg.scripts.prepublishOnly).toBeDefined();
    expect(typeof pkg.scripts.prepublishOnly).toBe("string");
  });

  it.skipIf(!hasDist)("dist contains no test files", () => {
    const allPaths = walkDir(distDir);

    const testDirs = allPaths.filter((p) => p.includes("__tests__"));
    expect(testDirs).toHaveLength(0);

    const testFiles = allPaths.filter(
      (p) => p.endsWith(".test.js") || p.endsWith(".test.d.ts"),
    );
    expect(testFiles).toHaveLength(0);
  });
});
