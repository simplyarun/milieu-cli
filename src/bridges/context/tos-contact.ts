import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";

export function checkTosUrl(spec: ParsedOpenApiSpec | undefined, llmsTxtBody: string | null): Check {
  const id = "context_tos_url";
  const label = "Terms of Service URL";
  const specTos = spec?.info?.termsOfService;
  if (typeof specTos === "string" && specTos.trim() !== "") {
    return { id, label, status: "pass", detail: `Terms of Service URL found in spec: ${specTos}`, data: { source: "spec", url: specTos } };
  }
  if (llmsTxtBody) {
    const urlPattern = /https?:\/\/\S+(?:terms|tos|legal)\S*/i;
    const match = llmsTxtBody.match(urlPattern);
    if (match) return { id, label, status: "partial", detail: `Terms of Service URL found in llms.txt: ${match[0]}`, data: { source: "llms.txt", url: match[0] } };
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
