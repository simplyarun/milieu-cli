import type { Check } from "../../core/types.js";

/**
 * Detect webhook support signals in HTML content.
 *
 * Scans for "webhook" keyword in three specific locations:
 * 1. Link hrefs containing "webhook"
 * 2. Link text containing "webhook"
 * 3. Headings (h1-h6) containing "webhook"
 *
 * Avoids matching arbitrary paragraph text to reduce false positives
 * from blog content or incidental mentions.
 *
 * Pure function -- no HTTP calls.
 */
export function checkWebhookSupport(html: string): Check {
  const id = "webhook_support";
  const label = "Webhook Support";

  const signals: string[] = [];

  // Check for links containing "webhook" in href
  if (/<a\s[^>]*href=["'][^"']*webhook[^"']*["']/gi.test(html)) {
    signals.push("webhook link");
  }

  // Check for "webhook" in link text
  if (/<a\s[^>]*>[^<]*webhook[^<]*<\/a>/gi.test(html)) {
    signals.push("webhook link text");
  }

  // Check for "webhook" in headings
  if (/<h[1-6][^>]*>[^<]*webhook[^<]*<\/h[1-6]>/gi.test(html)) {
    signals.push("webhook heading");
  }

  if (signals.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No webhook support signals detected",
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `Webhook support detected: ${signals.join(", ")}`,
    data: { signals },
  };
}
