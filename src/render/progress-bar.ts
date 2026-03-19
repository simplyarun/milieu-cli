import { green, yellow, red } from "./colors.js";

/**
 * Render a 12-character progress bar for a scored bridge.
 * Score 0-100 maps to 0-12 filled characters.
 *
 * Uses Unicode block characters:
 * - U+2588 (full block) for filled
 * - U+2591 (light shade) for empty
 */
export function progressBar(score: number): string {
  const width = 12;
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);

  if (score >= 80) return green(bar);
  if (score >= 40) return yellow(bar);
  return red(bar);
}
