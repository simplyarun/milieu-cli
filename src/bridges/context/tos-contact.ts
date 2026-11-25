import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";

/** Select a web URL with a legal path segment, preferring a direct terms link. */
function selectTosUrl(candidates: Iterable<RegExpMatchArray>, baseUrl?: string): string | null {
  let legalUrl: string | null = null;
  for (const match of candidates) {
    const href = baseUrl ? match[1] : match[0].replace(/[.,;:!?)}\]]+$/, "");
    if (href.startsWith("#")) continue;
    const url = URL.parse(href, baseUrl);
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) continue;
    if (/\/(?:terms|tos)(?=[-/]|$)/i.test(url.pathname)) return url.href;
    if (!legalUrl && /\/legal(?=[-/]|$)/i.test(url.pathname)) legalUrl = url.href;
  }
  return legalUrl;
}

export function extractTosUrl(text: string): string | null {
  return selectTosUrl(text.matchAll(/https?:\/\/[^\s<>"'()\]]+/gi));
}

export function extractTosUrlFromHtml(html: string, baseUrl: string): string | null {
  const hrefPattern = /<a(?=\s)[^<>]*?\shref\s*=\s*["']([^"']+)["']/gi;
  return selectTosUrl(html.matchAll(hrefPattern), baseUrl);
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
  const url = typeof specTos === "string" ? URL.parse(specTos) : null;
  if (url?.protocol === "https:" || url?.protocol === "http:") {
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
