import { fetchPath } from "./fetch-utils.js";
import type { SchemaMarkupCheckResult } from "../types.js";

const ACTION_TYPES = new Set([
  "SearchAction",
  "OrderAction",
  "BuyAction",
  "ViewAction",
  "ReadAction",
  "ListenAction",
  "WatchAction",
  "DownloadAction",
  "SubscribeAction",
  "RegisterAction",
  "BookmarkAction",
  "ShareAction",
  "CommentAction",
  "ReviewAction",
  "ReserveAction",
  "CheckInAction",
  "CheckOutAction",
  "RentAction",
  "TradeAction",
  "QuoteAction",
  "PayAction",
  "SendAction",
  "ReceiveAction",
  "ReturnAction",
  "ReplaceAction",
  "CancelAction",
  "ScheduleAction",
  "InviteAction",
  "ConfirmAction",
]);

function extractTypes(obj: unknown): string[] {
  const types: string[] = [];

  if (Array.isArray(obj)) {
    for (const item of obj) {
      types.push(...extractTypes(item));
    }
  } else if (obj && typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    if (typeof record["@type"] === "string") {
      types.push(record["@type"]);
    } else if (Array.isArray(record["@type"])) {
      for (const t of record["@type"]) {
        if (typeof t === "string") types.push(t);
      }
    }
    // Recurse into nested objects
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        types.push(...extractTypes(value));
      }
    }
  }

  return types;
}

function analyzeOgCompleteness(html: string): { title: boolean; description: boolean; image: boolean; url: boolean; type: boolean; twitterCard: boolean } {
  const hasTag = (prop: string): boolean => {
    const re = new RegExp(`<meta\\s+[^>]*(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["'][^"']+["']|<meta\\s+[^>]*content\\s*=\\s*["'][^"']+["'][^>]*(?:property|name)\\s*=\\s*["']${prop}["']`, "i");
    return re.test(html);
  };
  return {
    title: hasTag("og:title"),
    description: hasTag("og:description"),
    image: hasTag("og:image"),
    url: hasTag("og:url"),
    type: hasTag("og:type"),
    twitterCard: hasTag("twitter:card") || hasTag("twitter:site"),
  };
}

function analyzeCanonicalUrl(html: string): { hasCanonicalUrl: boolean; canonicalUrl?: string } {
  const match = html.match(/<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i)
    || html.match(/<link\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i);
  return {
    hasCanonicalUrl: !!match,
    canonicalUrl: match?.[1],
  };
}

function analyzeSemanticHtml(html: string): {
  hasProperHeadingHierarchy: boolean;
  imgAltCoverage: number;
  hasAriaLandmarks: boolean;
  h1Count: number;
  totalImages: number;
  imagesWithAlt: number;
  elementsFound: string[];
  elementsMissing: string[];
  ariaLabelCount: number;
} {
  // Heading hierarchy
  const headingMatches = [...html.matchAll(/<h([1-6])[^>]*>/gi)];
  const levels = headingMatches.map((m) => parseInt(m[1], 10));
  const h1Count = levels.filter((l) => l === 1).length;
  let hasProperHeadingHierarchy = true;
  if (levels.length > 1) {
    const uniqueLevels = [...new Set(levels)].sort();
    for (let i = 1; i < uniqueLevels.length; i++) {
      if (uniqueLevels[i] - uniqueLevels[i - 1] > 1) {
        hasProperHeadingHierarchy = false;
        break;
      }
    }
  }

  // Image alt coverage
  const imgMatches = [...html.matchAll(/<img\s[^>]*>/gi)];
  const totalImages = imgMatches.length;
  const imagesWithAlt = imgMatches.filter((m) => {
    const tag = m[0];
    const altMatch = tag.match(/alt\s*=\s*["']([^"']*)["']/i);
    return altMatch && altMatch[1].trim().length > 0;
  }).length;
  const imgAltCoverage = totalImages > 0 ? imagesWithAlt / totalImages : 1;

  // ARIA landmarks
  const hasAriaLandmarks =
    /<main[\s>]/i.test(html) ||
    /<nav[\s>]/i.test(html) ||
    /<header[\s>]/i.test(html) ||
    /<footer[\s>]/i.test(html) ||
    /role\s*=\s*["'](main|navigation|banner|contentinfo)["']/i.test(html);

  // Semantic element inventory
  const semanticElements = ["header", "nav", "main", "section", "footer", "article", "aside"] as const;
  const elementsFound = semanticElements.filter((el) => new RegExp(`<${el}[\\s>]`, "i").test(html));
  const elementsMissing = semanticElements.filter((el) => !new RegExp(`<${el}[\\s>]`, "i").test(html));

  // ARIA label count
  const ariaLabelCount = (html.match(/aria-label\s*=/gi) || []).length;

  return {
    hasProperHeadingHierarchy,
    imgAltCoverage: Math.round(imgAltCoverage * 100) / 100,
    hasAriaLandmarks,
    h1Count,
    totalImages,
    imagesWithAlt,
    elementsFound: [...elementsFound],
    elementsMissing: [...elementsMissing],
    ariaLabelCount,
  };
}

const AI_VALUABLE_SCHEMA_TYPES = new Set([
  "FAQPage",
  "HowTo",
  "Article",
  "NewsArticle",
  "BlogPosting",
  "Product",
  "BreadcrumbList",
  "Recipe",
  "LocalBusiness",
]);

function analyzeStructuralClarity(html: string): {
  questionHeadingCount: number;
  totalH2H3Count: number;
  hasLists: boolean;
  hasTables: boolean;
} {
  const headingMatches = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)];
  const totalH2H3Count = headingMatches.length;

  const questionPattern = /^(?:what|how|why|when|where|which|can|does|is|are|should|will)\b/i;
  let questionHeadingCount = 0;
  for (const m of headingMatches) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (questionPattern.test(text) || text.endsWith("?")) {
      questionHeadingCount++;
    }
  }

  // Detect lists outside <nav>
  const bodyWithoutNav = html.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  const hasLists = /<[uo]l[\s>]/i.test(bodyWithoutNav);

  // Detect tables outside <nav> and <footer>
  const bodyWithoutNavFooter = bodyWithoutNav.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  const hasTables = /<table[\s>]/i.test(bodyWithoutNavFooter);

  return { questionHeadingCount, totalH2H3Count, hasLists, hasTables };
}

function analyzeAiValuableTypes(types: string[]): string[] {
  return types.filter((t) => AI_VALUABLE_SCHEMA_TYPES.has(t));
}

function analyzeFreshness(html: string, ldJsonBlocks: unknown[]): {
  freshnessSignal: "fresh" | "aging" | "stale" | "unknown";
  latestDateFound?: string;
} {
  const dates: Date[] = [];

  // Extract dates from JSON-LD blocks
  for (const block of ldJsonBlocks) {
    const json = JSON.stringify(block);
    const dateMatches = json.matchAll(/"(?:datePublished|dateModified|dateCreated)"\s*:\s*"([^"]+)"/g);
    for (const m of dateMatches) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) dates.push(d);
    }
  }

  // Extract from meta tags
  const metaDatePatterns = [
    /property\s*=\s*["']article:(?:published_time|modified_time)["'][^>]*content\s*=\s*["']([^"']+)["']/gi,
    /content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']article:(?:published_time|modified_time)["']/gi,
  ];
  for (const pattern of metaDatePatterns) {
    for (const m of html.matchAll(pattern)) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) dates.push(d);
    }
  }

  // Extract from <time datetime>
  for (const m of html.matchAll(/<time[^>]+datetime\s*=\s*["']([^"']+)["']/gi)) {
    const d = new Date(m[1]);
    if (!isNaN(d.getTime())) dates.push(d);
  }

  if (dates.length === 0) {
    return { freshnessSignal: "unknown" };
  }

  const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
  const daysSince = (Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24);

  let freshnessSignal: "fresh" | "aging" | "stale";
  if (daysSince < 90) freshnessSignal = "fresh";
  else if (daysSince < 365) freshnessSignal = "aging";
  else freshnessSignal = "stale";

  return { freshnessSignal, latestDateFound: latest.toISOString().split("T")[0] };
}

function analyzeAuthorship(html: string, ldJsonBlocks: unknown[]): { hasAuthorship: boolean; hasTimestamps: boolean } {
  let hasAuthorship = false;
  let hasTimestamps = false;

  // Check meta tags
  if (/<meta\s[^>]*(?:property|name)\s*=\s*["'](?:article:author|author)["']/i.test(html)) {
    hasAuthorship = true;
  }
  if (/<meta\s[^>]*property\s*=\s*["']article:published_time["']/i.test(html)) {
    hasTimestamps = true;
  }
  // Check for <time> element
  if (/<time\s[^>]*datetime/i.test(html)) {
    hasTimestamps = true;
  }

  // Check JSON-LD blocks
  for (const block of ldJsonBlocks) {
    const json = JSON.stringify(block);
    if (/"author"/.test(json)) hasAuthorship = true;
    if (/"datePublished"|"dateModified"|"dateCreated"/.test(json)) hasTimestamps = true;
  }

  return { hasAuthorship, hasTimestamps };
}

function analyzeRssFeeds(html: string): { rssFeeds: { title: string; href: string }[]; jsonFeedUrl?: string } {
  const rssFeeds: { title: string; href: string }[] = [];
  let jsonFeedUrl: string | undefined;

  // Match <link> tags with RSS/Atom types
  const rssAtomRe = /<link\s[^>]*type\s*=\s*["']application\/(?:rss|atom)\+xml["'][^>]*>/gi;
  for (const match of html.matchAll(rssAtomRe)) {
    const tag = match[0];
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    const titleMatch = tag.match(/title\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch) {
      rssFeeds.push({ title: titleMatch?.[1] ?? "", href: hrefMatch[1] });
    }
  }

  // Match <link> tags with JSON Feed type
  const jsonFeedRe = /<link\s[^>]*type\s*=\s*["']application\/feed\+json["'][^>]*>/gi;
  for (const match of html.matchAll(jsonFeedRe)) {
    const tag = match[0];
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch) {
      jsonFeedUrl = hrefMatch[1];
      break;
    }
  }

  return { rssFeeds, jsonFeedUrl };
}

function analyzeLinkTextQuality(html: string): { total: number; nonDescriptive: number } {
  // Strip nav and footer to focus on body content
  const bodyContent = html
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  const nonDescriptivePatterns = /^(?:click here|here|read more|more|link|learn more)$/i;
  let total = 0;
  let nonDescriptive = 0;

  const anchorRe = /<a\s[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of bodyContent.matchAll(anchorRe)) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    total++;
    if (nonDescriptivePatterns.test(text)) {
      nonDescriptive++;
    }
  }

  return { total, nonDescriptive };
}

export async function checkSchemaMarkup(
  domain: string,
): Promise<SchemaMarkupCheckResult> {
  try {
    const result = await fetchPath(domain, "/");

    if (
      !result ||
      result.status !== 200 ||
      !result.body ||
      result.blockedByBotProtection
    ) {
      return {
        pass: false,
        hasSchemaMarkup: false,
        types: [],
        hasActionTypes: false,
        actionTypes: [],
        infoTypes: [],
        blockedByBotProtection: result?.blockedByBotProtection,
      };
    }

    const html = result.body;

    // Extract og:site_name for display
    const ogSiteNameMatch = html.match(
      /<meta\s+(?:property\s*=\s*["']og:site_name["']\s+content\s*=\s*["']([^"']+)["']|content\s*=\s*["']([^"']+)["']\s+property\s*=\s*["']og:site_name["'])/i
    );
    let siteTitle = (ogSiteNameMatch?.[1] || ogSiteNameMatch?.[2])?.trim() || undefined;

    // Fallback: extract brand name from og:title or <title> (text before | or - or --)
    if (!siteTitle) {
      const ogTitleMatch = html.match(
        /<meta\s+(?:property\s*=\s*["']og:title["']\s+content\s*=\s*["']([^"']+)["']|content\s*=\s*["']([^"']+)["']\s+property\s*=\s*["']og:title["'])/i
      );
      const rawTitle = (ogTitleMatch?.[1] || ogTitleMatch?.[2])?.trim()
        || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
      if (rawTitle) {
        const brand = rawTitle.split(/\s*[|\u2013\u2014:]\s*/)[0].trim();
        if (brand && brand.length <= 30) {
          siteTitle = brand;
        }
      }
    }

    const allTypes: string[] = [];
    const ldJsonBlocks: unknown[] = [];

    // 1. Extract from <script type="application/ld+json"> blocks
    const ldJsonRegex =
      /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

    for (const match of html.matchAll(ldJsonRegex)) {
      const jsonContent = match[1].trim();
      try {
        const parsed = JSON.parse(jsonContent);
        ldJsonBlocks.push(parsed);
        allTypes.push(...extractTypes(parsed));
      } catch {
        // Skip malformed JSON-LD blocks
      }
    }

    // 2. Extract from microdata (itemtype attributes)
    const microdataRegex = /itemtype\s*=\s*["']https?:\/\/schema\.org\/([^"']+)["']/gi;
    for (const match of html.matchAll(microdataRegex)) {
      allTypes.push(match[1]);
    }

    // 3. Check for og:type and other meta-based schema hints
    const ogTypeMatch = html.match(/property\s*=\s*["']og:type["']\s+content\s*=\s*["']([^"']+)["']/i);
    if (ogTypeMatch) {
      // Map og:type to approximate schema types
      const ogTypeMap: Record<string, string> = {
        website: "WebSite",
        article: "Article",
        product: "Product",
        "music.song": "MusicRecording",
        "video.movie": "Movie",
        profile: "Person",
        business: "Organization",
      };
      const mapped = ogTypeMap[ogTypeMatch[1].toLowerCase()];
      if (mapped) allTypes.push(mapped);
    }

    // Deduplicate
    const uniqueTypes = [...new Set(allTypes)];

    const actionTypes = uniqueTypes.filter((t) => ACTION_TYPES.has(t));
    const infoTypes = uniqueTypes.filter((t) => !ACTION_TYPES.has(t));

    // New analyses
    const ogCompleteness = analyzeOgCompleteness(html);
    const ogCompletenessScore = [ogCompleteness.title, ogCompleteness.description, ogCompleteness.image, ogCompleteness.url, ogCompleteness.type, ogCompleteness.twitterCard].filter(Boolean).length;
    const canonical = analyzeCanonicalUrl(html);
    const semanticHtml = analyzeSemanticHtml(html);
    const authorship = analyzeAuthorship(html, ldJsonBlocks);
    const structural = analyzeStructuralClarity(html);
    const aiValuableSchemaTypes = analyzeAiValuableTypes(uniqueTypes);
    const freshness = analyzeFreshness(html, ldJsonBlocks);
    const rssResult = analyzeRssFeeds(html);
    const linkTextQuality = analyzeLinkTextQuality(html);

    // Detect twitter:card type
    const twitterCardTypeMatch = html.match(/<meta\s[^>]*(?:property|name)\s*=\s*["']twitter:card["'][^>]*content\s*=\s*["']([^"']+)["']|<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["']twitter:card["']/i);
    const twitterCardType = (twitterCardTypeMatch?.[1] || twitterCardTypeMatch?.[2]) ?? undefined;

    return {
      pass: uniqueTypes.length > 0,
      hasSchemaMarkup: uniqueTypes.length > 0,
      types: uniqueTypes,
      hasActionTypes: actionTypes.length > 0,
      actionTypes,
      infoTypes,
      siteTitle,
      hasTwitterCard: ogCompleteness.twitterCard,
      twitterCardType,
      rssFeeds: rssResult.rssFeeds,
      jsonFeedUrl: rssResult.jsonFeedUrl,
      linkTextQuality,
      ogCompleteness,
      ogCompletenessScore,
      hasCanonicalUrl: canonical.hasCanonicalUrl,
      canonicalUrl: canonical.canonicalUrl,
      semanticHtml,
      hasAuthorship: authorship.hasAuthorship,
      hasTimestamps: authorship.hasTimestamps,
      questionHeadingCount: structural.questionHeadingCount,
      totalH2H3Count: structural.totalH2H3Count,
      hasLists: structural.hasLists,
      hasTables: structural.hasTables,
      aiValuableSchemaTypes,
      freshnessSignal: freshness.freshnessSignal,
      latestDateFound: freshness.latestDateFound,
    };
  } catch (err) {
    return {
      pass: false,
      hasSchemaMarkup: false,
      types: [],
      hasActionTypes: false,
      actionTypes: [],
      infoTypes: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default checkSchemaMarkup;
