export interface BaseCheckResult {
  pass: boolean;
  blockedByBotProtection?: boolean;
  error?: string;
}

export interface RobotsCheckResult extends BaseCheckResult {
  hasRobotsTxt: boolean;
  aiCrawlerDirectives: {
    agent: string;
    allowed: boolean;
  }[];
  allowsAllCrawlers: boolean;
  blocksAllCrawlers: boolean;
  discoveredPaths?: string[];
}

export interface SitemapCheckResult extends BaseCheckResult {
  hasSitemap: boolean;
  entryCount: number;
  sitemapUrl?: string;
  isSitemapIndex?: boolean;
  aiRelevantEntries: number;
  aiRelevantUrls: string[];
}

export interface LlmsTxtCheckResult extends BaseCheckResult {
  hasLlmsTxt: boolean;
  hasLlmsFullTxt: boolean;
  hasWellKnownLlmsTxt: boolean;
  llmsTxtSize?: number;
  llmsFullTxtSize?: number;
  wellKnownLlmsTxtSize?: number;
  discoveredResources: number;
  discoveredResourceUrls: string[];
  hasH1?: boolean;
  hasBlockquoteSummary?: boolean;
  h2Count?: number;
  linkCount?: number;
  isWellStructured?: boolean;
}

export interface SchemaMarkupCheckResult extends BaseCheckResult {
  hasSchemaMarkup: boolean;
  types: string[];
  hasActionTypes: boolean;
  actionTypes: string[];
  infoTypes: string[];
  siteTitle?: string;
  hasTwitterCard?: boolean;
  twitterCardType?: string;
  rssFeeds?: { title: string; href: string }[];
  jsonFeedUrl?: string;
  linkTextQuality?: { total: number; nonDescriptive: number };
  ogCompleteness?: { title: boolean; description: boolean; image: boolean; url: boolean; type: boolean; twitterCard: boolean };
  ogCompletenessScore?: number;
  hasCanonicalUrl?: boolean;
  canonicalUrl?: string;
  semanticHtml?: {
    hasProperHeadingHierarchy: boolean;
    imgAltCoverage: number;
    hasAriaLandmarks: boolean;
    h1Count: number;
    totalImages?: number;
    imagesWithAlt?: number;
    elementsFound?: string[];
    elementsMissing?: string[];
    ariaLabelCount?: number;
  };
  hasAuthorship?: boolean;
  hasTimestamps?: boolean;
  questionHeadingCount?: number;
  totalH2H3Count?: number;
  hasLists?: boolean;
  hasTables?: boolean;
  aiValuableSchemaTypes?: string[];
  freshnessSignal?: "fresh" | "aging" | "stale" | "unknown";
  latestDateFound?: string;
}

export interface HttpHealthCheckResult extends BaseCheckResult {
  httpsEnforced: boolean;
  ttfbMs?: number;
  hasJsFreeContent: boolean;
  visibleTextLength?: number;
  spaFrameworkDetected?: string;
  hasViewportMeta?: boolean;
  pageSizeBytes?: number;
  textToHtmlRatio?: number;
  hasRobotsMetaNoindex?: boolean;
}

export interface ContentCheckResults {
  robots?: RobotsCheckResult;
  sitemap?: SitemapCheckResult;
  llmsTxt?: LlmsTxtCheckResult;
  schemaMarkup?: SchemaMarkupCheckResult;
  httpHealth?: HttpHealthCheckResult;
}
