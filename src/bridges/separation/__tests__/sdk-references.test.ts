import { describe, it, expect } from "vitest";
import { checkSdkReferences } from "../sdk-references.js";

describe("checkSdkReferences", () => {
  it("returns id 'sdk_references' and label 'SDK/Package References'", () => {
    const result = checkSdkReferences("No packages here");
    expect(result.id).toBe("sdk_references");
    expect(result.label).toBe("SDK/Package References");
  });

  it("returns pass with npm when npmjs.com URL found", () => {
    const html = '<a href="https://npmjs.com/package/my-sdk">npm</a>';
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("npm");
  });

  it("returns pass with PyPI when pip install found", () => {
    const html = "<code>pip install my-package</code>";
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("PyPI");
  });

  it("returns pass with PyPI when pypi.org URL found", () => {
    const html = "Visit https://pypi.org/project/my-lib/ for details";
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("PyPI");
  });

  it("returns pass with Go when pkg.go.dev URL found", () => {
    const html = '<a href="https://pkg.go.dev/my-mod">Go</a>';
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Go");
  });

  it("returns pass with RubyGems when rubygems.org URL found", () => {
    const html = '<a href="https://rubygems.org/gems/my-gem">gem</a>';
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("RubyGems");
  });

  it("returns pass with NuGet when nuget.org URL found", () => {
    const html = '<a href="https://nuget.org/packages/my-pkg">NuGet</a>';
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("NuGet");
  });

  it("returns pass with Maven when search.maven.org found", () => {
    const html = "See https://search.maven.org for Java libs";
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Maven");
  });

  it("returns pass with NuGet when dotnet add package found", () => {
    const html = "dotnet add package MyLib";
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("NuGet");
  });

  it("returns pass with Go when go get found", () => {
    const html = "go get github.com/my/mod";
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("Go");
  });

  it("returns pass with RubyGems when gem install found", () => {
    const html = "gem install my-gem";
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    expect(result.data?.registries).toContain("RubyGems");
  });

  it("returns fail when no packages found", () => {
    const result = checkSdkReferences("No packages here");
    expect(result.status).toBe("fail");
  });

  it("returns multiple registries deduplicated", () => {
    const html =
      '<a href="https://npmjs.com/package/my-sdk">npm</a> ' +
      "npm install my-sdk " +
      '<a href="https://pypi.org/project/my-lib/">PyPI</a>';
    const result = checkSdkReferences(html);
    expect(result.status).toBe("pass");
    const registries = result.data?.registries as string[];
    expect(registries).toContain("npm");
    expect(registries).toContain("PyPI");
    // npm should not be duplicated
    expect(registries.filter((r) => r === "npm")).toHaveLength(1);
  });
});
