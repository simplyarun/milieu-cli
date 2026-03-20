import { describe, it, expect } from "vitest";
import { checkJsonLd } from "../json-ld.js";

describe("checkJsonLd", () => {
  it("returns Check with id 'json_ld' and label 'JSON-LD Structured Data'", () => {
    const result = checkJsonLd("");
    expect(result.id).toBe("json_ld");
    expect(result.label).toBe("JSON-LD Structured Data");
  });

  it("returns pass with 1 JSON-LD block containing @type Organization", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Organization","name":"Example"}
        </script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("1 JSON-LD block found: Organization");
    expect(result.data).toBeDefined();
    const data = result.data as { blocks: Array<{ type: string | string[]; context: unknown }> };
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0].type).toBe("Organization");
  });

  it("returns pass with 3 JSON-LD blocks listing all types", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@type":"Organization","@context":"https://schema.org"}</script>
        <script type="application/ld+json">{"@type":"WebSite","@context":"https://schema.org"}</script>
        <script type="application/ld+json">{"@type":"BreadcrumbList","@context":"https://schema.org"}</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("3 JSON-LD blocks found: Organization, WebSite, BreadcrumbList");
  });

  it("extracts each object from a JSON-LD array", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          [
            {"@type":"Organization","@context":"https://schema.org","name":"Org"},
            {"@type":"WebSite","@context":"https://schema.org","name":"Site"}
          ]
        </script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("2 JSON-LD blocks found: Organization, WebSite");
    const data = result.data as { blocks: Array<{ type: string | string[]; context: unknown }> };
    expect(data.blocks).toHaveLength(2);
  });

  it("returns fail when no JSON-LD blocks in HTML", () => {
    const html = `<html><head><title>No LD</title></head><body><p>Hello</p></body></html>`;
    const result = checkJsonLd(html);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No JSON-LD structured data found");
  });

  it("skips JSON-LD blocks with invalid JSON", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{ not valid json }</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("fail");
  });

  it("skips JSON-LD blocks missing @type", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@context":"https://schema.org","name":"No Type"}</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("fail");
  });

  it("returns fail for empty string input", () => {
    const result = checkJsonLd("");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No JSON-LD structured data found");
  });

  it("returns blocks array in data field", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@type":"Product","@context":"https://schema.org"}</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    const data = result.data as { blocks: Array<{ type: string | string[]; context: unknown }> };
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0]).toEqual({
      type: "Product",
      context: "https://schema.org",
    });
  });

  it("handles @type as array of strings", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@type":["Organization","LocalBusiness"],"@context":"https://schema.org"}</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("1 JSON-LD block found: Organization, LocalBusiness");
  });

  it("handles single quotes around application/ld+json", () => {
    const html = `
      <html><head>
        <script type='application/ld+json'>{"@type":"Organization","@context":"https://schema.org"}</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
  });

  it("handles @graph array -- top-level without @type returns fail", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"Organization"}]}
        </script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    // Top-level object has no @type; implementation checks top-level only
    expect(result.status).toBe("fail");
  });

  it("handles whitespace and newlines inside script tag", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">

          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Test"
          }

        </script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("1 JSON-LD block found: Organization");
  });

  it("handles multiple script tags with mixed valid and invalid JSON", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@type":"Product","@context":"https://schema.org"}</script>
        <script type="application/ld+json">{ not valid json at all</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("1 JSON-LD block found: Product");
  });

  it("handles @context as object with @vocab", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@context":{"@vocab":"https://schema.org/"},"@type":"Product"}
        </script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    const data = result.data as { blocks: Array<{ type: string | string[]; context: unknown }> };
    expect(data.blocks[0].context).toEqual({ "@vocab": "https://schema.org/" });
  });

  it("ignores script tags without type attribute", () => {
    const html = `
      <html><head>
        <script>{"@type":"Thing","@context":"https://schema.org"}</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("fail");
  });

  it("ignores script tags with wrong type", () => {
    const html = `
      <html><head>
        <script type="application/json">{"@type":"Thing","@context":"https://schema.org"}</script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("fail");
  });

  it("handles deeply nested properties with @type at top level", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Organization","address":{"@type":"PostalAddress","streetAddress":"123 Main St","addressLocality":"City","addressRegion":"ST","postalCode":"12345"}}
        </script>
      </head><body></body></html>
    `;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("1 JSON-LD block found: Organization");
  });

  it("handles many JSON-LD blocks (10+)", () => {
    const types = [
      "Organization", "WebSite", "Product", "Person", "Event",
      "Article", "LocalBusiness", "Recipe", "FAQ", "BreadcrumbList",
    ];
    const scripts = types
      .map((t) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"${t}"}</script>`)
      .join("\n        ");
    const html = `<html><head>${scripts}</head><body></body></html>`;
    const result = checkJsonLd(html);
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("10 JSON-LD blocks found:");
    const data = result.data as { blocks: Array<{ type: string | string[]; context: unknown }> };
    expect(data.blocks).toHaveLength(10);
  });
});
