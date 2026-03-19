import type { Check } from "../../core/types.js";
import type { JsonLdBlock } from "./json-ld.js";

/**
 * Check for Schema.org markup via JSON-LD vocabulary and Microdata attributes.
 *
 * Takes the JSON-LD Check result (from checkJsonLd) to avoid re-parsing HTML
 * for JSON-LD blocks. Also scans raw HTML for Microdata itemtype attributes
 * containing schema.org URLs.
 *
 * Pure function -- no HTTP calls.
 */
export function checkSchemaOrg(
  html: string,
  jsonLdCheck: Check,
): Check {
  const id = "schema_org";
  const label = "Schema.org Markup";

  const types: string[] = [];
  const sources: ("json-ld" | "microdata")[] = [];

  // Check JSON-LD blocks for schema.org @context
  if (
    jsonLdCheck.status === "pass" &&
    jsonLdCheck.data &&
    Array.isArray((jsonLdCheck.data as { blocks?: unknown }).blocks)
  ) {
    const blocks = (jsonLdCheck.data as { blocks: JsonLdBlock[] }).blocks;
    let foundSchemaOrg = false;

    for (const block of blocks) {
      if (isSchemaOrgContext(block.context)) {
        foundSchemaOrg = true;
        const typeNames = flattenType(block.type);
        for (const t of typeNames) {
          if (!types.includes(t)) {
            types.push(t);
          }
        }
      }
    }

    if (foundSchemaOrg) {
      sources.push("json-ld");
    }
  }

  // Check Microdata itemtype attributes for schema.org
  const microdataRegex =
    /itemtype=["'](https?:\/\/schema\.org\/[^"']+)["']/gi;
  let match: RegExpExecArray | null;
  const microdataTypes: string[] = [];

  while ((match = microdataRegex.exec(html)) !== null) {
    const typeUrl = match[1];
    const typeName = typeUrl.split("/").pop();
    if (typeName && !microdataTypes.includes(typeName)) {
      microdataTypes.push(typeName);
    }
  }

  if (microdataTypes.length > 0) {
    sources.push("microdata");
    for (const t of microdataTypes) {
      if (!types.includes(t)) {
        types.push(t);
      }
    }
  }

  if (types.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No Schema.org markup found",
    };
  }

  // Build detail string based on sources
  const typesStr = types.join(", ");
  let detail: string;
  if (sources.includes("json-ld") && sources.includes("microdata")) {
    detail = `Schema.org types found via JSON-LD and Microdata: ${typesStr}`;
  } else if (sources.includes("json-ld")) {
    detail = `Schema.org types found via JSON-LD: ${typesStr}`;
  } else {
    detail = `Schema.org types found via Microdata: ${typesStr}`;
  }

  return {
    id,
    label,
    status: "pass",
    detail,
    data: { types, sources },
  };
}

/**
 * Check if a JSON-LD @context value references schema.org.
 */
function isSchemaOrgContext(context: unknown): boolean {
  if (typeof context === "string") {
    return context.includes("schema.org");
  }
  if (Array.isArray(context)) {
    return context.some(
      (item) => typeof item === "string" && item.includes("schema.org"),
    );
  }
  return false;
}

/**
 * Flatten a @type value to an array of type name strings.
 */
function flattenType(type: string | string[]): string[] {
  return Array.isArray(type) ? type : [type];
}
