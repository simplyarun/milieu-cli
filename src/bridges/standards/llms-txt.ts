import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

export interface LlmsTxtResult {
  check: Check;
  body: string | null;
}

/**
 * Check for llms.txt at the domain root.
 *
 * Per llmstxt.org spec: Markdown format, H1 required as first line.
 * Returns pass if H1 present, partial if file exists but no H1, fail if missing.
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

  const sizeBytes = new TextEncoder().encode(result.body).byteLength;
  const firstLine = result.body.trim().split("\n")[0].trim();

  if (/^#\s+\S/.test(firstLine)) {
    return {
      check: {
        id,
        label,
        status: "pass",
        detail: `llms.txt found (${sizeBytes} bytes)`,
        data: { sizeBytes, firstLine },
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

  const sizeBytes = new TextEncoder().encode(result.body).byteLength;

  return {
    id,
    label,
    status: "pass",
    detail: `llms-full.txt found (${sizeBytes} bytes)`,
    data: { sizeBytes },
  };
}
