#!/usr/bin/env node

import { normalizeUrl, isUrl } from "./checks/fetch-utils.js";
import { checkRobots } from "./checks/robots.js";
import { checkLlmsTxt } from "./checks/llms-txt.js";
import { checkSitemap } from "./checks/sitemap.js";
import { checkSchemaMarkup } from "./checks/schema-markup.js";
import { checkHttpHealth } from "./checks/http-health.js";
import { calculateContentScore, type ContentScoreResult } from "./scoring.js";
import type { ContentCheckResults } from "./types.js";

const USAGE = `
Usage: milieu-content-score <url> [--json]

Score how well your website's content is prepared for AI agents and LLMs.

Options:
  --json    Output results as JSON
`.trim();

// --- Signal labels for terminal output ---

const SIGNAL_LABELS: Record<string, Record<string, string>> = {
  schemaMarkup: {
    hasSchemaMarkup: "Has structured data (schema.org)",
    hasActionTypes: "Has action types",
    ogTagsComplete: "OG tags complete",
    hasCanonicalUrl: "Canonical URL",
    headingHierarchyAndAria: "Heading hierarchy + ARIA",
    authorshipOrTimestamps: "Authorship or timestamps",
    questionHeadingsOrAiSchemaTypes: "Question headings / AI schema types",
    contentFreshness: "Content freshness",
    rssFeedsOrJsonFeed: "RSS/Atom/JSON feeds",
    imageAltCoverage: "Image alt coverage \u226580%",
  },
  llmsTxt: {
    hasLlmsTxt: "Has llms.txt",
    isWellStructured: "Well-structured",
    hasLlmsFullTxt: "Has llms-full.txt",
  },
  robots: {
    hasRobotsTxt: "Has robots.txt",
    allowsThreeOrMoreAiCrawlers: "Allows \u22653 AI crawlers",
    allowsAtLeastOneAiCrawler: "Allows \u22651 AI crawler",
  },
  sitemap: {
    hasSitemap: "Has XML sitemap",
    fiftyPlusEntries: "50+ entries",
  },
  httpHealth: {
    httpsEnforced: "HTTPS enforced",
    jsFreeContent: "JS-free content",
  },
};

const CHECK_LABELS: Record<string, string> = {
  schemaMarkup: "Schema Markup",
  llmsTxt: "llms.txt",
  robots: "robots.txt",
  sitemap: "Sitemap",
  httpHealth: "HTTP Health",
};

function printTerminalOutput(domain: string, score: ContentScoreResult): void {
  console.log();
  console.log(`  milieu content score \u00B7 ${domain}`);
  console.log();

  const checkOrder = ["schemaMarkup", "llmsTxt", "robots", "sitemap", "httpHealth"] as const;

  for (const checkName of checkOrder) {
    const check = score.checks[checkName];
    const label = CHECK_LABELS[checkName];
    const scoreStr = `${check.earned}/${check.max}`;
    const padding = 50 - label.length - scoreStr.length;
    console.log(`  ${label}${" ".repeat(Math.max(1, padding))}${scoreStr}`);

    const signalLabels = SIGNAL_LABELS[checkName];
    for (const [key, displayLabel] of Object.entries(signalLabels)) {
      // For robots: only show the relevant tier
      if (checkName === "robots") {
        if (key === "allowsThreeOrMoreAiCrawlers" && !check.signals[key] && check.signals.allowsAtLeastOneAiCrawler) {
          // Show the lower tier as passing instead
          continue;
        }
        if (key === "allowsAtLeastOneAiCrawler" && check.signals.allowsThreeOrMoreAiCrawlers) {
          // Higher tier passed, skip lower tier
          continue;
        }
      }

      const passed = check.signals[key];
      const icon = passed ? "\u2713" : "\u2717";
      console.log(`    ${icon} ${displayLabel}`);
    }

    console.log();
  }

  console.log("  " + "\u2500".repeat(45));
  const totalLabel = "Content Score";
  const totalStr = `${score.contentScore}/${score.contentMax}`;
  const totalPadding = 50 - totalLabel.length - totalStr.length;
  console.log(`  ${totalLabel}${" ".repeat(Math.max(1, totalPadding))}${totalStr}`);
  console.log();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes("--json");
  const urlArg = args.find((a: string) => !a.startsWith("--"));

  if (!urlArg) {
    console.log(USAGE);
    process.exit(1);
  }

  if (!isUrl(urlArg)) {
    console.error(`Error: "${urlArg}" doesn't look like a valid URL or domain.`);
    process.exit(1);
  }

  const domain = normalizeUrl(urlArg);

  // Wave 1: robots + llms.txt (parallel)
  const [robotsResult, llmsTxtResult] = await Promise.all([
    checkRobots(domain),
    checkLlmsTxt(domain),
  ]);

  // Wave 2: sitemap, schema markup, http health (parallel)
  const [sitemapResult, schemaMarkupResult, httpHealthResult] = await Promise.all([
    checkSitemap(domain),
    checkSchemaMarkup(domain),
    checkHttpHealth(domain),
  ]);

  const results: ContentCheckResults = {
    robots: robotsResult,
    llmsTxt: llmsTxtResult,
    sitemap: sitemapResult,
    schemaMarkup: schemaMarkupResult,
    httpHealth: httpHealthResult,
  };

  const score = calculateContentScore(results);

  if (jsonFlag) {
    console.log(JSON.stringify({
      domain,
      contentScore: score.contentScore,
      contentMax: score.contentMax,
      rawScore: score.rawScore,
      rawMax: score.rawMax,
      checks: score.checks,
    }, null, 2));
  } else {
    printTerminalOutput(domain, score);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
