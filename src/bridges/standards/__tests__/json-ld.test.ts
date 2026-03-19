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
});
