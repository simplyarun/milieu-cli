import type { ContentCheckResults } from "./types.js";

const RAW_MAX = 30;
const NORMALIZED_MAX = 100;

interface CheckScore {
  earned: number;
  max: number;
  signals: Record<string, boolean>;
}

export interface ContentScoreResult {
  contentScore: number;
  contentMax: typeof NORMALIZED_MAX;
  rawScore: number;
  rawMax: typeof RAW_MAX;
  checks: {
    schemaMarkup: CheckScore;
    llmsTxt: CheckScore;
    robots: CheckScore;
    sitemap: CheckScore;
    httpHealth: CheckScore;
  };
}

export function calculateContentScore(results: ContentCheckResults): ContentScoreResult {
  // Schema Markup: 10 pts
  const schemaMarkup = scoreSchemaMarkup(results);

  // llms.txt: 10 pts
  const llmsTxt = scoreLlmsTxt(results);

  // robots.txt: 6 pts
  const robots = scoreRobots(results);

  // Sitemap: 2 pts
  const sitemap = scoreSitemap(results);

  // HTTP Health: 2 pts
  const httpHealth = scoreHttpHealth(results);

  const rawScore = schemaMarkup.earned + llmsTxt.earned + robots.earned + sitemap.earned + httpHealth.earned;
  const contentScore = Math.round((rawScore / RAW_MAX) * NORMALIZED_MAX);

  return {
    contentScore,
    contentMax: NORMALIZED_MAX,
    rawScore,
    rawMax: RAW_MAX,
    checks: { schemaMarkup, llmsTxt, robots, sitemap, httpHealth },
  };
}

function scoreSchemaMarkup(results: ContentCheckResults): CheckScore {
  const r = results.schemaMarkup;
  const signals: Record<string, boolean> = {
    hasSchemaMarkup: false,
    hasActionTypes: false,
    ogTagsComplete: false,
    hasCanonicalUrl: false,
    headingHierarchyAndAria: false,
    authorshipOrTimestamps: false,
    questionHeadingsOrAiSchemaTypes: false,
    contentFreshness: false,
    rssFeedsOrJsonFeed: false,
    imageAltCoverage: false,
  };

  let earned = 0;

  if (r?.hasSchemaMarkup) {
    signals.hasSchemaMarkup = true;
    earned += 3;

    if (r.hasActionTypes) {
      signals.hasActionTypes = true;
      earned += 3;
    }

    // Rich content bonus (8 possible criteria, capped at 4)
    let richContent = 0;

    if ((r.ogCompletenessScore ?? 0) >= 4) {
      signals.ogTagsComplete = true;
      richContent += 1;
    }
    if (r.hasCanonicalUrl) {
      signals.hasCanonicalUrl = true;
      richContent += 1;
    }
    if (r.semanticHtml?.hasProperHeadingHierarchy && r.semanticHtml?.hasAriaLandmarks) {
      signals.headingHierarchyAndAria = true;
      richContent += 1;
    }
    if (r.hasAuthorship || r.hasTimestamps) {
      signals.authorshipOrTimestamps = true;
      richContent += 1;
    }
    if ((r.questionHeadingCount ?? 0) >= 2 || (r.aiValuableSchemaTypes?.length ?? 0) > 0) {
      signals.questionHeadingsOrAiSchemaTypes = true;
      richContent += 1;
    }
    if (r.freshnessSignal === "fresh" || r.freshnessSignal === "aging") {
      signals.contentFreshness = true;
      richContent += 1;
    }
    if ((r.rssFeeds?.length ?? 0) > 0 || !!r.jsonFeedUrl) {
      signals.rssFeedsOrJsonFeed = true;
      richContent += 1;
    }
    if ((r.semanticHtml?.imgAltCoverage ?? 0) >= 0.8) {
      signals.imageAltCoverage = true;
      richContent += 1;
    }

    earned += Math.min(4, richContent);
  }

  return { earned, max: 10, signals };
}

function scoreLlmsTxt(results: ContentCheckResults): CheckScore {
  const r = results.llmsTxt;
  const signals: Record<string, boolean> = {
    hasLlmsTxt: false,
    isWellStructured: false,
    hasLlmsFullTxt: false,
  };

  let earned = 0;

  if (r?.hasLlmsTxt) {
    signals.hasLlmsTxt = true;
    earned += 3;
    if (r.isWellStructured) {
      signals.isWellStructured = true;
      earned += 2;
    }
  }
  if (r?.hasLlmsFullTxt) {
    signals.hasLlmsFullTxt = true;
    earned += 5;
  }

  return { earned, max: 10, signals };
}

function scoreRobots(results: ContentCheckResults): CheckScore {
  const r = results.robots;
  const signals: Record<string, boolean> = {
    hasRobotsTxt: false,
    allowsThreeOrMoreAiCrawlers: false,
    allowsAtLeastOneAiCrawler: false,
  };

  let earned = 0;

  if (r?.hasRobotsTxt) {
    signals.hasRobotsTxt = true;
    earned += 2;

    const keyCrawlers = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];
    const keyAllowed = r.aiCrawlerDirectives.filter(
      (d) => keyCrawlers.includes(d.agent) && d.allowed
    ).length;

    if (keyAllowed >= 3) {
      signals.allowsThreeOrMoreAiCrawlers = true;
      earned += 4;
    } else if (keyAllowed >= 1) {
      signals.allowsAtLeastOneAiCrawler = true;
      earned += 2;
    }
  }

  return { earned, max: 6, signals };
}

function scoreSitemap(results: ContentCheckResults): CheckScore {
  const r = results.sitemap;
  const signals: Record<string, boolean> = {
    hasSitemap: false,
    fiftyPlusEntries: false,
  };

  let earned = 0;

  if (r?.hasSitemap) {
    signals.hasSitemap = true;
    earned += 1;
    if (r.entryCount >= 50) {
      signals.fiftyPlusEntries = true;
      earned += 1;
    }
  }

  return { earned, max: 2, signals };
}

function scoreHttpHealth(results: ContentCheckResults): CheckScore {
  const r = results.httpHealth;
  const signals: Record<string, boolean> = {
    httpsEnforced: false,
    jsFreeContent: false,
  };

  let earned = 0;

  if (r?.httpsEnforced) {
    signals.httpsEnforced = true;
    earned += 1;
  }
  if (r?.hasJsFreeContent) {
    signals.jsFreeContent = true;
    earned += 1;
  }

  return { earned, max: 2, signals };
}
