import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

export interface LlmsTxtResult {
  check: Check;
  body: string | null;
}

export interface LlmsContentQuality {
  sectionCount: number;
  linkCount: number;
  hasApiReferences: boolean;
  lineCount: number;
}

/**
 * Analyze llms.txt / llms-full.txt content for quality signals.
 */
export function analyzeLlmsContent(body: string): LlmsContentQuality {
  const sectionCount = (body.match(/^##\s+/gm) ?? []).length;
  const linkCount = (body.match(/https?:\/\/\S+/g) ?? []).length;
  const hasApiReferences =
    /\b(api|endpoint|sdk|developer|integration|webhook|oauth|graphql|rest)\b/i.test(body);
  const lineCount = body.split("\n").filter((l) => l.trim().length > 0).length;
  return { sectionCount, linkCount, hasApiReferences, lineCount };
}

/**
 * Check for llms.txt at the domain root.
 *
 * Per llmstxt.org spec: Markdown format, H1 required as first line.
 * Returns pass if H1 present with quality content, partial if file exists
 * but no H1 or lacks structured sections/links, fail if missing.
 */
export async function checkLlmsTxt(
  baseUrl: string,
  timeout?: number,
): Promise<LlmsTxtResult> {
  const id = "llms_txt";
  const label = "llms.txt";

  const result = await httpGet(`${baseUrl}/llms.txt`, { timeout });

  if (!result.ok) {
    return { check: { id, label, status: "fail", detail: "No llms.txt found" }, body: null };
  }

  if (result.body.trim().length === 0) {
    return { check: { id, label, status: "fail", detail: "No llms.txt found" }, body: null };
  }

  // Reject soft 404s: servers returning HTML instead of the actual file
  const contentType = (result.headers["content-type"] ?? "").toLowerCase();
  if (contentType.includes("text/html")) {
    return { check: { id, label, status: "fail", detail: "No llms.txt found (HTML response)" }, body: null };
  }

  const sizeBytes = new TextEncoder().encode(result.body).byteLength;
  const firstLine = result.body.trim().split("\n")[0].trim();

  if (/^#\s+\S/.test(firstLine)) {
    const quality = analyzeLlmsContent(result.body);

    if (quality.sectionCount === 0 && quality.linkCount === 0) {
      return {
        check: {
          id,
          label,
          status: "partial",
          detail: "llms.txt found but lacks sections or links",
          data: { sizeBytes, firstLine, ...quality },
        },
        body: result.body,
      };
    }

    return {
      check: {
        id,
        label,
        status: "pass",
        detail: `llms.txt found (${sizeBytes} bytes, ${quality.sectionCount} sections, ${quality.linkCount} links)`,
        data: { sizeBytes, firstLine, ...quality },
      },
      body: result.body,
    };
  }

  return {
    check: {
      id,
      label,
      status: "partial",
      detail: "llms.txt found but missing H1 header",
      data: { sizeBytes, firstLine },
    },
    body: result.body,
  };
}

/**
 * Check for llms-full.txt at the domain root.
 *
 * No H1 requirement -- just check for presence and non-empty body.
 * Returns partial if under 500 bytes (~100 words), indicating minimal content.
 */
export async function checkLlmsFullTxt(
  baseUrl: string,
  timeout?: number,
): Promise<Check> {
  const id = "llms_full_txt";
  const label = "llms-full.txt";

  const result = await httpGet(`${baseUrl}/llms-full.txt`, { timeout });

  if (!result.ok || result.body.trim().length === 0) {
    return { id, label, status: "fail", detail: "No llms-full.txt found" };
  }

  // Reject soft 404s: servers returning HTML instead of the actual file
  const contentType = (result.headers["content-type"] ?? "").toLowerCase();
  if (contentType.includes("text/html")) {
    return { id, label, status: "fail", detail: "No llms-full.txt found (HTML response)" };
  }

  const sizeBytes = new TextEncoder().encode(result.body).byteLength;
  const quality = analyzeLlmsContent(result.body);

  if (sizeBytes < 500) {
    return {
      id,
      label,
      status: "partial",
      detail: `llms-full.txt found but minimal (${sizeBytes} bytes)`,
      data: { sizeBytes, ...quality },
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `llms-full.txt found (${sizeBytes} bytes)`,
    data: { sizeBytes, ...quality },
  };
}
