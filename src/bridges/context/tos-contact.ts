import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";

/**
 * Extract a clean ToS/legal URL from free text.
 *
 * Requires /terms, /tos, or /legal to appear as a path segment start
 * (preceded by /, followed by -, /, or end-of-URL). This prevents false
 * positives on "denial-of-service", "analytics-overview", etc.
 */
export function extractTosUrl(text: string): string | null {
  const urlPattern = /https?:\/\/[^\s<>"'()\]]*\/(?:terms|tos|legal)(?:[-\/][^\s<>"'()\]]*|[^\s<>"'()\]]*)*/gi;
  const matches: string[] = [];
  for (const match of text.matchAll(urlPattern)) {
    const candidate = match[0].replace(/[.,;:!?)}\]]+$/, "");
    try {
      new URL(candidate);
      matches.push(candidate);
    } catch {
      continue;
    }
  }
  if (matches.length === 0) return null;
  // Prefer /terms or /tos over /legal — more specific ToS signals
  const preferred = matches.find(u => /\/(?:terms|tos)([-\/]|$)/i.test(u));
  return preferred ?? matches[0];
}

/**
 * Extract ToS URL from HTML by scanning <a> tags for /terms, /tos, /legal hrefs.
 * Resolves relative URLs using the provided baseUrl.
 */
export function extractTosUrlFromHtml(html: string, baseUrl: string): string | null {
  const hrefPattern = /<a\s[^>]*href=["']([^"']*\/(?:terms|tos|legal)(?:[-\/][^"']*)?)["'][^>]*>/gi;
  const matches: string[] = [];
  for (const match of html.matchAll(hrefPattern)) {
    const href = match[1];
    if (href.startsWith("#") || href.startsWith("javascript:")) continue;
    try {
      const resolved = new URL(href, baseUrl);
      matches.push(resolved.href);
    } catch {
      continue;
    }
  }
  if (matches.length === 0) return null;
  // Prefer /terms or /tos over /legal — more specific ToS signals
  const preferred = matches.find(u => /\/(?:terms|tos)([-\/]|$)/i.test(u));
  return preferred ?? matches[0];
}

export function checkTosUrl(
  spec: ParsedOpenApiSpec | undefined,
  llmsTxtBody: string | null,
  pageBody: string | null,
  baseUrl: string,
): Check {
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
  if (pageBody) {
    const url = extractTosUrlFromHtml(pageBody, baseUrl);
    if (url) return { id, label, status: "partial", detail: `Terms of Service URL found in page: ${url}`, data: { source: "page", url } };
  }
  return { id, label, status: "fail", detail: "No Terms of Service URL found", data: { source: null, url: null } };
}

/**
 * Extract Contact email from security.txt body (RFC 9116 Contact: field).
 */
function extractSecurityTxtContact(securityTxtBody: string): string | null {
  const match = securityTxtBody.match(/^Contact:\s*(.+)/mi);
  return match ? match[1].trim() : null;
}

export function checkContactInfo(
  spec: ParsedOpenApiSpec | undefined,
  securityTxtBody: string | null,
): Check {
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
  if (securityTxtBody) {
    const contactValue = extractSecurityTxtContact(securityTxtBody);
    if (contactValue) {
      return { id, label, status: "partial", detail: `Contact info found in security.txt: ${contactValue}`, data: { email: null, url: contactValue } };
    }
  }
  return { id, label, status: "fail", detail: "No contact info found", data: { email: null, url: null } };
}
