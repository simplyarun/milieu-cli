// URL normalization and domain extraction
export { normalizeUrl, extractDomain, resolveRedirectUrl } from "./url.js";

// SSRF protection
export { isPrivateIp, validateDns } from "./ssrf.js";
export type { DnsCache, SsrfResult } from "./ssrf.js";

// HTTP client
export { httpGet } from "./http-client.js";
export type { HttpGetOptions } from "./http-client.js";
