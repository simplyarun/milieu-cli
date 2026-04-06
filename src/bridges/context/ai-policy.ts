import type { Check } from "../../core/types.js";

/** Keywords that indicate an AI usage policy */
const AI_POLICY_KEYWORDS = [
  "training",
  "commercial use",
  "agent",
  "automated",
  "ai policy",
  "llm",
  "scraping",
  "indexing",
];

/**
 * Check: context_ai_policy
 *
 * Sources (no HTTP): llmsTxtBody scanned for AI-policy keywords.
 *
 * - 2+ keywords → pass
 * - 1 keyword → partial
 * - No llms.txt but ToS URL present → partial
 * - Nothing → fail
 */
export function checkAiPolicy(
  llmsTxtBody: string | null,
  hasTosUrl: boolean,
): Check {
  const id = "context_ai_policy";
  const label = "AI Policy";

  if (llmsTxtBody) {
    const lower = llmsTxtBody.toLowerCase();
    const found = AI_POLICY_KEYWORDS.filter((kw) => lower.includes(kw));

    if (found.length >= 2) {
      return {
        id,
        label,
        status: "pass",
        detail: `AI policy signals found in llms.txt: ${found.join(", ")}`,
        data: { source: "llms.txt", keywordsFound: found },
      };
    }

    if (found.length === 1) {
      return {
        id,
        label,
        status: "partial",
        detail: `Single AI policy signal found in llms.txt: ${found[0]}`,
        data: { source: "llms.txt", keywordsFound: found },
      };
    }
  }

  // No llms.txt keywords, but ToS URL exists
  if (hasTosUrl) {
    return {
      id,
      label,
      status: "partial",
      detail:
        "No AI policy found in llms.txt, but Terms of Service URL is present",
      data: { source: "tos_url", keywordsFound: [] },
    };
  }

  return {
    id,
    label,
    status: "fail",
    detail: "No AI usage policy signals found",
    data: { source: null, keywordsFound: [] },
  };
}
