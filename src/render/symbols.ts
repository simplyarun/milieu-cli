import { green, red, yellow } from "./colors.js";

/**
 * Return a colored status symbol for verbose check display.
 *
 * pass    -> green checkmark
 * partial -> yellow warning
 * fail    -> red x
 * error   -> red x
 */
export function statusSymbol(
  status: "pass" | "partial" | "fail" | "error",
): string {
  switch (status) {
    case "pass":
      return green("\u2714");
    case "partial":
      return yellow("\u26A0");
    case "fail":
    case "error":
      return red("\u2718");
  }
}
