import type { Check } from "../core/types.js";
import { statusSymbol } from "./symbols.js";
import { dim } from "./colors.js";

export function formatVerboseChecks(checks: Check[]): string {
  return checks
    .map((check) => {
      const symbol = statusSymbol(check.status);
      const detail = check.detail ? dim(` (${check.detail})`) : "";
      return `    ${symbol} ${check.label}${detail}`;
    })
    .join("\n");
}
