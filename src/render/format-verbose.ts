import type { Check } from "../core/types.js";
import { statusSymbol } from "./symbols.js";
import { dim } from "./colors.js";
import { terminalText } from "./terminal-text.js";

export function formatVerboseChecks(checks: Check[], explainAll = false): string {
  return checks
    .map((check) => {
      const symbol = statusSymbol(check.status);
      const detail = check.detail ? dim(` (${terminalText(check.detail)})`) : "";
      const showWhy = check.why && (explainAll || check.status !== "pass");
      const why = showWhy ? `\n      ${dim(terminalText(check.why!))}` : "";
      return `    ${symbol} ${terminalText(check.label)}${detail}${why}`;
    })
    .join("\n");
}
