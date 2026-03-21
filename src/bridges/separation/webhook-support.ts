import type { Check, ContentSource } from "../../core/types.js";

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

/**
 * Detect webhook support signals across multiple content sources.
 *
 * Scans for "webhook" keyword in:
 * 1. HTML link hrefs containing "webhook"
 * 2. HTML link text containing "webhook"
 * 3. HTML headings (h1-h6) containing "webhook"
 * 4. Markdown links containing "webhook"
 * 5. Markdown headings containing "webhook"
 *
 * Avoids matching arbitrary paragraph text to reduce false positives
 * from blog content or incidental mentions.
 *
 * Pure function -- no HTTP calls.
 */
export function checkWebhookSupport(sources: ContentSource[]): Check {
  const id = "webhook_support";
  const label = "Webhook Support";

  const signals: string[] = [];
  const signalSources: string[] = [];

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

    if (sourceContributed && !signalSources.includes(source)) {
      signalSources.push(source);
    }
  }

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
