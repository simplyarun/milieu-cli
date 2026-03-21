import type { Check, ContentSource } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Structured signals passed from upstream bridges */
export interface WebhookDetectionOptions {
  /** HTTP response headers from the homepage (for WebSub rel="hub") */
  pageHeaders?: Record<string, string>;
  /** OpenAPI 3.1+ top-level `webhooks` key detected in spec */
  openApiHasWebhooks?: boolean;
  /** OpenAPI 3.0+ `callbacks` detected in any spec operation */
  openApiHasCallbacks?: boolean;
}

// ---------------------------------------------------------------------------
// Tier 3: Keyword heuristic patterns (low confidence)
// ---------------------------------------------------------------------------

/** HTML patterns for webhook detection */
const HTML_PATTERNS: { pattern: RegExp; signal: string }[] = [
  {
    pattern: /<a\s[^>]*href=["'][^"']*webhook[^"']*["']/gi,
    signal: "webhook link",
  },
  {
    pattern: /<a\s[^>]*>[^<]*webhook[^<]*<\/a>/gi,
    signal: "webhook link text",
  },
  {
    pattern: /<h[1-6][^>]*>[^<]*webhook[^<]*<\/h[1-6]>/gi,
    signal: "webhook heading",
  },
];

/** Markdown patterns for webhook detection */
const MARKDOWN_PATTERNS: { pattern: RegExp; signal: string }[] = [
  { pattern: /\[.*webhook.*\]\(/gi, signal: "webhook link (markdown)" },
  { pattern: /^#{1,6}\s+.*webhook/gim, signal: "webhook heading (markdown)" },
];

/** Structured data patterns — catches webhook paths in JSON state, JS config, etc. */
const STRUCTURED_PATTERNS: { pattern: RegExp; signal: string }[] = [
  // Matches "/path/webhooks" or "\\u002Fpath\\u002Fwebhooks" in JSON/JS
  { pattern: /["'](?:\/|\\u002[Ff])[^"']*webhook[^"']*["']/gi, signal: "webhook path" },
];

// ---------------------------------------------------------------------------
// Tier 2: Standard-compliant behavioral patterns (medium confidence)
// ---------------------------------------------------------------------------

/** Patterns for Standard Webhooks and CloudEvents header references in content */
const BEHAVIORAL_PATTERNS: { pattern: RegExp; signal: string }[] = [
  // Standard Webhooks headers (https://standardwebhooks.com)
  { pattern: /webhook-id/i, signal: "standard webhooks headers" },
  { pattern: /webhook-timestamp/i, signal: "standard webhooks headers" },
  { pattern: /webhook-signature/i, signal: "standard webhooks headers" },
  { pattern: /whsec_/i, signal: "standard webhooks secret" },
  // CloudEvents HTTP Webhook headers (https://github.com/cloudevents/spec)
  { pattern: /WebHook-Request-Origin/i, signal: "cloudevents webhook" },
  { pattern: /WebHook-Allowed-Origin/i, signal: "cloudevents webhook" },
];

// ---------------------------------------------------------------------------
// Tier 1 helpers: WebSub discovery
// ---------------------------------------------------------------------------

/**
 * Check for WebSub hub discovery in HTML content.
 * Looks for `<link rel="hub" href="...">`.
 */
function detectWebSubInHtml(html: string): boolean {
  return /<link\s[^>]*rel=["']hub["'][^>]*>/i.test(html);
}

/**
 * Check for WebSub hub discovery in HTTP Link headers.
 * Looks for `Link: <url>; rel="hub"`.
 */
function detectWebSubInHeaders(headers: Record<string, string>): boolean {
  const linkHeader = headers["link"] ?? "";
  return /rel=["']?hub["']?/i.test(linkHeader);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect webhook support signals using tiered detection:
 *
 * **Tier 1 (high confidence):** Structured specs
 *   - OpenAPI 3.1+ `webhooks` key
 *   - OpenAPI 3.0+ `callbacks` in operations
 *   - WebSub `rel="hub"` in HTML `<link>` or HTTP Link header
 *
 * **Tier 2 (medium confidence):** Standard-compliant behavioral signals
 *   - Standard Webhooks headers (webhook-id, webhook-timestamp, webhook-signature)
 *   - Standard Webhooks secret prefix (whsec_)
 *   - CloudEvents webhook headers (WebHook-Request-Origin, WebHook-Allowed-Origin)
 *
 * **Tier 3 (low confidence):** Keyword heuristics
 *   - HTML links, headings, and link text containing "webhook"
 *   - Markdown links and headings containing "webhook"
 *   - URL paths containing "webhook" in JSON/JS structured data
 *
 * Pure function — no HTTP calls.
 */
export function checkWebhookSupport(
  sources: ContentSource[],
  options: WebhookDetectionOptions = {},
): Check {
  const id = "webhook_support";
  const label = "Webhook Support";

  const signals: string[] = [];
  const signalSources: string[] = [];

  // --- Tier 1: Structured specs (high confidence) ---

  if (options.openApiHasWebhooks) {
    signals.push("openapi webhooks");
    if (!signalSources.includes("openapi spec")) {
      signalSources.push("openapi spec");
    }
  }

  if (options.openApiHasCallbacks) {
    signals.push("openapi callbacks");
    if (!signalSources.includes("openapi spec")) {
      signalSources.push("openapi spec");
    }
  }

  // WebSub: check HTML content sources and HTTP headers
  if (options.pageHeaders && detectWebSubInHeaders(options.pageHeaders)) {
    signals.push("websub hub");
    if (!signalSources.includes("http headers")) {
      signalSources.push("http headers");
    }
  }

  for (const { content, source } of sources) {
    if (detectWebSubInHtml(content)) {
      if (!signals.includes("websub hub")) {
        signals.push("websub hub");
      }
      if (!signalSources.includes(source)) {
        signalSources.push(source);
      }
    }
  }

  // --- Tier 2: Behavioral patterns (medium confidence) ---

  for (const { content, source } of sources) {
    let sourceContributed = false;

    for (const { pattern, signal } of BEHAVIORAL_PATTERNS) {
      pattern.lastIndex = 0;
      if (!signals.includes(signal) && pattern.test(content)) {
        signals.push(signal);
        sourceContributed = true;
      }
    }

    if (sourceContributed && !signalSources.includes(source)) {
      signalSources.push(source);
    }
  }

  // --- Tier 3: Keyword heuristics (low confidence) ---

  for (const { content, source } of sources) {
    let sourceContributed = false;

    // HTML patterns
    for (const { pattern, signal } of HTML_PATTERNS) {
      pattern.lastIndex = 0;
      if (!signals.includes(signal) && pattern.test(content)) {
        signals.push(signal);
        sourceContributed = true;
      }
    }

    // Markdown patterns
    for (const { pattern, signal } of MARKDOWN_PATTERNS) {
      pattern.lastIndex = 0;
      if (!signals.includes(signal) && pattern.test(content)) {
        signals.push(signal);
        sourceContributed = true;
      }
    }

    // Structured data patterns (JSON state, JS config)
    for (const { pattern, signal } of STRUCTURED_PATTERNS) {
      pattern.lastIndex = 0;
      if (!signals.includes(signal) && pattern.test(content)) {
        signals.push(signal);
        sourceContributed = true;
      }
    }

    if (sourceContributed && !signalSources.includes(source)) {
      signalSources.push(source);
    }
  }

  // --- Result ---

  if (signals.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No webhook support signals detected",
    };
  }

  const sourceAttr =
    signalSources.length > 0 ? ` in ${signalSources.join(", ")}` : "";

  return {
    id,
    label,
    status: "pass",
    detail: `Webhook support detected${sourceAttr}: ${signals.join(", ")}`,
    data: { signals, sources: signalSources },
  };
}
