import { describe, it, expect } from "vitest";
import type { ContentSource } from "../../../core/types.js";
import { checkSdkReferences } from "../sdk-references.js";

/** Helper to wrap a single content string into a ContentSource array */
function sources(content: string, source = "homepage"): ContentSource[] {
  return [{ content, source }];
}

describe("checkSdkReferences", () => {
  it("returns id 'sdk_references' and label 'SDK/Package References'", () => {
    const result = checkSdkReferences(sources("No packages here"));
    expect(result.id).toBe("sdk_references");
    expect(result.label).toBe("SDK/Package References");
  });

  it("returns pass with npm when npmjs.com URL found", () => {
    const html = '<a href="https://npmjs.com/package/my-sdk">npm</a>';
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("npm");
  });

  it("returns pass with PyPI when pip install found", () => {
    const html = "<code>pip install my-package</code>";
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("PyPI");
  });

  it("returns pass with PyPI when pypi.org URL found", () => {
    const html = "Visit https://pypi.org/project/my-lib/ for details";
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("PyPI");
  });

  it("returns pass with Go when pkg.go.dev URL found", () => {
    const html = '<a href="https://pkg.go.dev/my-mod">Go</a>';
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Go");
  });

  it("returns pass with RubyGems when rubygems.org URL found", () => {
    const html = '<a href="https://rubygems.org/gems/my-gem">gem</a>';
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("RubyGems");
  });

  it("returns pass with NuGet when nuget.org URL found", () => {
    const html = '<a href="https://nuget.org/packages/my-pkg">NuGet</a>';
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("NuGet");
  });

  it("returns pass with Maven when search.maven.org found", () => {
    const html = "See https://search.maven.org for Java libs";
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Maven");
  });

  it("returns pass with NuGet when dotnet add package found", () => {
    const html = "dotnet add package MyLib";
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("NuGet");
  });

  it("returns pass with Go when go get found", () => {
    const html = "go get github.com/my/mod";
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Go");
  });

  it("returns pass with RubyGems when gem install found", () => {
    const html = "gem install my-gem";
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("RubyGems");
  });

  it("returns fail when no packages found", () => {
    const result = checkSdkReferences(sources("No packages here"));
    expect(result.status).toBe("fail");
  });

  it("returns multiple registries deduplicated", () => {
    const html =
      '<a href="https://npmjs.com/package/my-sdk">npm</a> ' +
      "npm install my-sdk " +
      '<a href="https://pypi.org/project/my-lib/">PyPI</a>';
    const result = checkSdkReferences(sources(html));
    expect(result.status).toBe("pass");
    const registries = result.data?.registries as string[];
    expect(registries).toContain("npm");
    expect(registries).toContain("PyPI");
    // npm should not be duplicated
    expect(registries.filter((r) => r === "npm")).toHaveLength(1);
  });

  // --- Multi-source tests ---

  it("detects registries across multiple content sources", () => {
    const result = checkSdkReferences([
      { content: '<a href="https://npmjs.com/package/my-sdk">npm</a>', source: "homepage" },
      { content: "pip install my-lib", source: "llms.txt" },
    ]);
    expect(result.status).toBe("pass");
    const registries = result.data?.registries as string[];
    expect(registries).toContain("npm");
    expect(registries).toContain("PyPI");
  });

  it("includes source attribution in detail", () => {
    const result = checkSdkReferences([
      { content: '<a href="https://npmjs.com/package/my-sdk">npm</a>', source: "homepage" },
      { content: "pip install my-lib", source: "llms.txt" },
    ]);
    expect(result.detail).toContain("in homepage, llms.txt");
    expect(result.data?.sources).toEqual(["homepage", "llms.txt"]);
  });

  it("deduplicates registries across sources", () => {
    const result = checkSdkReferences([
      { content: '<a href="https://npmjs.com/package/my-sdk">npm</a>', source: "homepage" },
      { content: "npm install my-sdk", source: "llms.txt" },
    ]);
    expect(result.status).toBe("pass");
    const registries = result.data?.registries as string[];
    expect(registries.filter((r) => r === "npm")).toHaveLength(1);
  });

  it("returns fail for empty sources array", () => {
    const result = checkSdkReferences([]);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No SDK/package references found");
  });

  // --- New registry pattern tests ---

  it("detects jsdelivr CDN as npm (CDN)", () => {
    const result = checkSdkReferences(sources("https://cdn.jsdelivr.net/npm/my-lib@1.0/dist/lib.js"));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("npm (CDN)");
  });

  it("detects unpkg CDN as npm (CDN)", () => {
    const result = checkSdkReferences(sources("https://unpkg.com/my-lib@1.0/dist/lib.js"));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("npm (CDN)");
  });

  it("detects Packagist URL", () => {
    const result = checkSdkReferences(sources("https://packagist.org/packages/vendor/my-lib"));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Packagist");
  });

  it("detects composer require as Packagist", () => {
    const result = checkSdkReferences(sources("composer require vendor/my-lib"));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Packagist");
  });

  it("detects Crates.io URL", () => {
    const result = checkSdkReferences(sources("https://crates.io/crates/my-crate"));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Crates.io");
  });

  it("detects cargo add as Crates.io", () => {
    const result = checkSdkReferences(sources("cargo add my-crate"));
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Crates.io");
  });
});
