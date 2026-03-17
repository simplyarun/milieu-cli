/** Subdomains where documentation and API specs are commonly hosted. */
const DOC_SUBDOMAINS = ["docs", "developer", "developers", "api"];

/**
 * Returns the base domain plus common doc/API subdomains to probe.
 * If the domain is already a subdomain (3+ parts), returns it as-is.
 */
export function getSubdomains(domain: string): string[] {
  const base = domain.replace(/^www\./, "");
  const parts = base.split(".");

  if (parts.length > 2) return [base];
  return [base, `www.${base}`, ...DOC_SUBDOMAINS.map((s) => `${s}.${base}`)];
}
