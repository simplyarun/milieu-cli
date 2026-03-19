import type { Check } from "../../core/types.js";

/** Extracted JSON-LD block with type and context information */
export interface JsonLdBlock {
  type: string | string[];
  context: unknown;
}

/**
 * Flatten a JSON-LD @type value to a display string.
 * If array, join with ", "; if string, return as-is.
 */
function typeToString(type: string | string[]): string {
  return Array.isArray(type) ? type.join(", ") : type;
}

/**
 * Extract JSON-LD structured data blocks from HTML.
 *
 * Scans for <script type="application/ld+json"> tags via regex,
 * parses JSON, and collects blocks with @type fields.
 *
 * Pure function -- no HTTP calls. Takes HTML string directly.
 */
export function checkJsonLd(html: string): Check {
  const id = "json_ld";
  const label = "JSON-LD Structured Data";

  const blocks: JsonLdBlock[] = [];
  const regex =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1]);

      // Handle both single objects and arrays of objects
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (
          typeof item === "object" &&
          item !== null &&
          "@type" in (item as Record<string, unknown>)
        ) {
          const obj = item as Record<string, unknown>;
          blocks.push({
            type: obj["@type"] as string | string[],
            context: obj["@context"] ?? null,
          });
        }
      }
    } catch {
      // Invalid JSON in script tag -- skip
    }
  }

  if (blocks.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No JSON-LD structured data found",
    };
  }

  const typesStr = blocks.map((b) => typeToString(b.type)).join(", ");
  const detail =
    blocks.length === 1
      ? `1 JSON-LD block found: ${typesStr}`
      : `${blocks.length} JSON-LD blocks found: ${typesStr}`;

  return {
    id,
    label,
    status: "pass",
    detail,
    data: { blocks },
  };
}
