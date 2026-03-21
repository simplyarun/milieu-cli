import type { Check } from "../core/types.js";
import { statusSymbol } from "./symbols.js";
import { dim } from "./colors.js";

export function formatVerboseChecks(checks: Check[]): string {
  return checks
    .map((check) => {
      const symbol = statusSymbol(check.status);
      const detail = check.detail ? dim(` (${check.detail})`) : "";
      const why =
        check.why && check.status !== "pass"
          ? `\n      ${dim(check.why)}`
          : "";
      return `    ${symbol} ${check.label}${detail}${why}`;
    })
    .join("\n");
}
