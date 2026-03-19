import { describe, it, expect } from "vitest";
import { checkSchemaOrg } from "../schema-org.js";
import { checkJsonLd } from "../json-ld.js";
import type { Check } from "../../../core/types.js";

// Helper to build a JSON-LD check result for testing
function makeJsonLdCheck(status: "pass" | "fail", blocks?: Array<{ type: string | string[]; context: unknown }>): Check {
  if (status === "pass" && blocks) {
    return {
      id: "json_ld",
      label: "JSON-LD Structured Data",
      status: "pass",
      detail: `${blocks.length} JSON-LD block(s) found`,
      data: { blocks },
    };
  }
  return {
    id: "json_ld",
    label: "JSON-LD Structured Data",
    status: "fail",
    detail: "No JSON-LD structured data found",
  };
}

describe("checkSchemaOrg", () => {
  it("returns Check with id 'schema_org' and label 'Schema.org Markup'", () => {
    const jsonLdCheck = makeJsonLdCheck("fail");
    const result = checkSchemaOrg("", jsonLdCheck);
    expect(result.id).toBe("schema_org");
    expect(result.label).toBe("Schema.org Markup");
  });

  it("returns pass with source json-ld when JSON-LD has schema.org @context", () => {
    const jsonLdCheck = makeJsonLdCheck("pass", [
      { type: "Organization", context: "https://schema.org" },
    ]);
    const result = checkSchemaOrg("", jsonLdCheck);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("Schema.org types found via JSON-LD: Organization");
    const data = result.data as { types: string[]; sources: string[] };
    expect(data.sources).toContain("json-ld");
  });

  it("returns pass with source microdata when HTML has Microdata itemtype", () => {
    const html = `<div itemscope itemtype="https://schema.org/Organization"><span itemprop="name">Test</span></div>`;
    const jsonLdCheck = makeJsonLdCheck("fail");
    const result = checkSchemaOrg(html, jsonLdCheck);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("Schema.org types found via Microdata: Organization");
    const data = result.data as { types: string[]; sources: string[] };
    expect(data.sources).toContain("microdata");
  });

  it("returns pass with both sources when JSON-LD and Microdata present", () => {
    const html = `<div itemscope itemtype="https://schema.org/Product"><span>P</span></div>`;
    const jsonLdCheck = makeJsonLdCheck("pass", [
      { type: "Organization", context: "https://schema.org" },
    ]);
    const result = checkSchemaOrg(html, jsonLdCheck);
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("JSON-LD and Microdata");
    const data = result.data as { types: string[]; sources: string[] };
    expect(data.sources).toEqual(["json-ld", "microdata"]);
  });

  it("returns fail when JSON-LD has non-schema.org @context", () => {
    const jsonLdCheck = makeJsonLdCheck("pass", [
      { type: "Thing", context: "https://example.org/vocab" },
    ]);
    const result = checkSchemaOrg("", jsonLdCheck);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No Schema.org markup found");
  });

  it("returns fail when no Schema.org signals at all", () => {
    const html = `<html><body><p>Plain page</p></body></html>`;
    const jsonLdCheck = makeJsonLdCheck("fail");
    const result = checkSchemaOrg(html, jsonLdCheck);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No Schema.org markup found");
  });

  it("detects Microdata with http:// (not https://) schema.org URL", () => {
    const html = `<div itemscope itemtype="http://schema.org/Person"><span>Name</span></div>`;
    const jsonLdCheck = makeJsonLdCheck("fail");
    const result = checkSchemaOrg(html, jsonLdCheck);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("Schema.org types found via Microdata: Person");
  });

  it("deduplicates types from JSON-LD and Microdata", () => {
    const html = `<div itemscope itemtype="https://schema.org/Organization"><span>Org</span></div>`;
    const jsonLdCheck = makeJsonLdCheck("pass", [
      { type: "Organization", context: "https://schema.org" },
    ]);
    const result = checkSchemaOrg(html, jsonLdCheck);
    expect(result.status).toBe("pass");
    const data = result.data as { types: string[] };
    // Organization should appear only once despite being in both sources
    expect(data.types.filter((t: string) => t === "Organization")).toHaveLength(1);
  });

  it("handles JSON-LD @context as array containing schema.org", () => {
    const jsonLdCheck = makeJsonLdCheck("pass", [
      { type: "Organization", context: ["https://schema.org", "https://example.org/vocab"] },
    ]);
    const result = checkSchemaOrg("", jsonLdCheck);
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("Organization");
  });

  it("integrates with real checkJsonLd output", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Test"}</script>
      </head><body></body></html>
    `;
    const jsonLdCheck = checkJsonLd(html);
    const result = checkSchemaOrg(html, jsonLdCheck);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("Schema.org types found via JSON-LD: WebSite");
  });
});
