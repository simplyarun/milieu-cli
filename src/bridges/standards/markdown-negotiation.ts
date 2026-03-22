import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkdownNegotiationResult {
  check: Check;
  /** Whether the server supports markdown content negotiation */
  supported: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Content-Signal directive keys relevant to AI agents */
const AI_SIGNAL_KEYS = ["ai-train", "ai-input", "search"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Content-Signal header value into a map of directives.
 * Format: "ai-train=yes, search=yes, ai-input=no"
 */
function parseContentSignal(
  header: string,
): Record<string, string> {
  const directives: Record<string, string> = {};
  for (const part of header.split(",")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
      const value = trimmed.slice(eqIdx + 1).trim().toLowerCase();
      directives[key] = value;
    }
  }
  return directives;
}

/**
 * Check if a Content-Type header indicates markdown.
 */
function isMarkdownContentType(headers: Record<string, string>): boolean {
  const ct = (headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  return ct === "text/markdown";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether a site supports markdown content negotiation for AI agents.
 *
 * Three signals checked:
 * 1. **Markdown response** — Send `Accept: text/markdown` to homepage,
 *    check if response has `content-type: text/markdown`
 * 2. **x-markdown-tokens header** — Indicates the server is markdown-aware
 *    and provides token count estimates
 * 3. **Content-Signal header** — AI permission directives like
 *    `ai-train=yes, ai-input=yes, search=yes`
 *
 * Status mapping:
 * - pass: Server returns markdown when requested (content negotiation works)
 * - partial: Content-Signal header present but no markdown negotiation,
 *   or x-markdown-tokens header found
 * - fail: No markdown support detected
 */
export async function checkMarkdownNegotiation(
  baseUrl: string,
  timeout?: number,
): Promise<MarkdownNegotiationResult> {
  const id = "markdown_negotiation";
  const label = "Markdown Content Negotiation";

  // Request the homepage with Accept: text/markdown preference
  const response = await httpGet(baseUrl, {
    timeout,
    headers: {
      Accept: "text/markdown, text/html;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    return {
      check: {
        id,
        label,
        status: "fail",
        detail: "Could not reach site to test markdown negotiation",
      },
      supported: false,
    };
  }

  const signals: string[] = [];

  // Signal 1: Does the response come back as markdown?
  const markdownResponse = isMarkdownContentType(response.headers);
  if (markdownResponse) {
    signals.push("text/markdown response");
  }

  // Signal 2: x-markdown-tokens header
  const tokenHeader = response.headers["x-markdown-tokens"];
  if (tokenHeader !== undefined) {
    signals.push("x-markdown-tokens header");
  }

  // Signal 3: Content-Signal header with AI directives
  const contentSignal = response.headers["content-signal"];
  if (contentSignal) {
    const directives = parseContentSignal(contentSignal);
    const activeDirectives = AI_SIGNAL_KEYS.filter(
      (key) => directives[key] !== undefined,
    );
    if (activeDirectives.length > 0) {
      signals.push(`Content-Signal (${activeDirectives.join(", ")})`);
    }
  }

  if (signals.length === 0) {
    return {
      check: {
        id,
        label,
        status: "fail",
        detail: "No markdown content negotiation support detected",
      },
      supported: false,
    };
  }

  // Markdown response = full support (pass), other signals alone = partial
  const status = markdownResponse ? "pass" : "partial";
  const detail =
    status === "pass"
      ? `Server returns markdown via content negotiation: ${signals.join(", ")}`
      : `AI content signals detected: ${signals.join(", ")}`;

  return {
    check: {
      id,
      label,
      status,
      detail,
      data: {
        signals,
        markdownResponse,
        hasTokenHeader: tokenHeader !== undefined,
        contentSignal: contentSignal ?? null,
      },
    },
    supported: markdownResponse,
  };
}
