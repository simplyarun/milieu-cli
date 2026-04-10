import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";

/**
 * Extract a clean ToS/legal URL from free text.
 *
 * Iterates over all URL-like matches containing "terms", "tos", or "legal",
 * strips trailing punctuation, and validates with `new URL()`.
 * Returns the first structurally valid URL, or null.
 */
export function extractTosUrl(text: string): string | null {
  const urlPattern = /https?:\/\/[^\s<>"'()\]]+(?:terms|tos|legal)[^\s<>"'()\]]*/gi;
  for (const match of text.matchAll(urlPattern)) {
    const candidate = match[0].replace(/[.,;:!?)}\]]+$/, "");
    try {
      new URL(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export function checkTosUrl(spec: ParsedOpenApiSpec | undefined, llmsTxtBody: string | null): Check {
  const id = "context_tos_url";
  const label = "Terms of Service URL";
  const specTos = spec?.info?.termsOfService;
  if (typeof specTos === "string" && specTos.trim() !== "") {
    return { id, label, status: "pass", detail: `Terms of Service URL found in spec: ${specTos}`, data: { source: "spec", url: specTos } };
  }
  if (llmsTxtBody) {
    const url = extractTosUrl(llmsTxtBody);
    if (url) return { id, label, status: "partial", detail: `Terms of Service URL found in llms.txt: ${url}`, data: { source: "llms.txt", url } };
  }
  return { id, label, status: "fail", detail: "No Terms of Service URL found", data: { source: null, url: null } };
}

export function checkContactInfo(spec: ParsedOpenApiSpec | undefined): Check {
  const id = "context_contact_info";
  const label = "Contact Info";
  const contact = spec?.info?.contact;
  const email = typeof contact?.email === "string" && contact.email.trim() !== "" ? contact.email : null;
  const url = typeof contact?.url === "string" && contact.url.trim() !== "" ? contact.url : null;
  if (email || url) {
    const parts: string[] = [];
    if (email) parts.push(`email: ${email}`);
    if (url) parts.push(`url: ${url}`);
    return { id, label, status: "pass", detail: `Contact info found in spec: ${parts.join(", ")}`, data: { email, url } };
  }
  return { id, label, status: "fail", detail: "No contact info found in spec", data: { email: null, url: null } };
}
