import { gunzipSync } from "node:zlib";
import { type FetchResult, fetchPath, fetchUrl } from "./fetch-utils.js";
import type { SitemapCheckResult } from "../types.js";

/**
 * Fetch a sitemap URL, decompressing `.xml.gz` content automatically.
 * For plain URLs delegates to `fetchUrl`; for `.gz` URLs fetches the raw
 * bytes, decompresses with `gunzipSync`, and returns the XML string.
 */
async function fetchSitemapUrl(url: string): Promise<FetchResult | null> {
  if (!url.endsWith(".gz")) {
    return fetchUrl(url);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "milieu-content-score/0.1" },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return { body: "", status: response.status, blockedByBotProtection: false, contentType: "" };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const body = gunzipSync(buffer).toString("utf-8");
    const contentType = response.headers.get("content-type") || "";

    return { body, status: response.status, blockedByBotProtection: false, contentType };
  } catch {
    return null;
  }
}

function countUrlEntries(body: string): number {
  const urlMatches = body.match(/<url[\s>]/gi);
  return urlMatches ? urlMatches.length : 0;
}

function isSitemapIndex(body: string): boolean {
  return /<sitemapindex[\s>]/i.test(body);
}

function extractChildSitemapUrls(body: string): string[] {
  const urls: string[] = [];
  const re = /<loc>(.*?)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

const AI_RELEVANT_RE =
  /\.md(\.txt)?(\?|$)|\/mcp\b|\/docs\/(api|sdk|reference|guides?|cookbook|tutorials?)\b|\/api-reference\b|\/reference\b|\/developers\/(agents|api|sdk)\b|\/guides?\b|\/cookbook\b|\/tutorials?\b|\/openapi\b|\/schema\b/i;
const LOC_CONTENT_RE = /<loc>(.*?)<\/loc>/gi;
const MAX_AI_RELEVANT_URLS = 10;
const MAX_CHILD_SITEMAPS = 5;

function extractAiRelevantUrls(body: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = LOC_CONTENT_RE.exec(body)) !== null) {
    const url = match[1].trim();
    if (AI_RELEVANT_RE.test(url)) {
      urls.push(url);
    }
  }
  return [...new Set(urls)].slice(0, MAX_AI_RELEVANT_URLS);
}

function extractSitemapUrlFromRobots(body: string): string | null {
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("sitemap:")) {
      const url = trimmed.slice("sitemap:".length).trim();
      if (url) return url;
    }
  }
  return null;
}

async function processSitemapIndex(body: string): Promise<{
  entryCount: number;
  aiRelevantUrls: string[];
}> {
  const childUrls = extractChildSitemapUrls(body);
  const childCount = childUrls.length;

  if (childCount === 0) {
    return { entryCount: 0, aiRelevantUrls: [] };
  }

  const sampled = childUrls.slice(0, MAX_CHILD_SITEMAPS);
  const results = await Promise.allSettled(
    sampled.map((url) => fetchSitemapUrl(url))
  );

  let sampledTotal = 0;
  const allAiUrls: string[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const { body: childBody, status, blockedByBotProtection } = result.value;
    if (status !== 200 || !childBody || blockedByBotProtection) continue;

    sampledTotal += countUrlEntries(childBody);
    allAiUrls.push(...extractAiRelevantUrls(childBody));
  }

  // Extrapolate if we only sampled a subset
  const entryCount =
    childCount > sampled.length
      ? Math.round((sampledTotal * childCount) / sampled.length)
      : sampledTotal;

  return {
    entryCount,
    aiRelevantUrls: [...new Set(allAiUrls)].slice(0, MAX_AI_RELEVANT_URLS),
  };
}

async function processSitemapBody(
  body: string,
  sitemapUrl: string
): Promise<SitemapCheckResult> {
  if (isSitemapIndex(body)) {
    const { entryCount, aiRelevantUrls } = await processSitemapIndex(body);
    return {
      pass: entryCount > 0,
      hasSitemap: true,
      entryCount,
      sitemapUrl,
      isSitemapIndex: true,
      aiRelevantEntries: aiRelevantUrls.length,
      aiRelevantUrls,
    };
  }

  const entryCount = countUrlEntries(body);
  const aiRelevantUrls = extractAiRelevantUrls(body);
  return {
    pass: entryCount > 0,
    hasSitemap: true,
    entryCount,
    sitemapUrl,
    aiRelevantEntries: aiRelevantUrls.length,
    aiRelevantUrls,
  };
}

export async function checkSitemap(
  domain: string,
): Promise<SitemapCheckResult> {
  try {
    // Try /sitemap.xml first, then /sitemap.xml.gz
    const result = await fetchPath(domain, "/sitemap.xml");

    if (result && result.status === 200 && result.body && !result.blockedByBotProtection) {
      return processSitemapBody(result.body, `https://${domain}/sitemap.xml`);
    }

    const gzResult = await fetchSitemapUrl(`https://${domain}/sitemap.xml.gz`);
    if (gzResult && gzResult.status === 200 && gzResult.body && !gzResult.blockedByBotProtection) {
      return processSitemapBody(gzResult.body, `https://${domain}/sitemap.xml.gz`);
    }

    // www. fallback: many sites host sitemaps on www. subdomain
    let wwwResult: typeof result = null;
    if (!domain.startsWith("www.")) {
      wwwResult = await fetchPath(`www.${domain}`, "/sitemap.xml");
      if (wwwResult && wwwResult.status === 200 && wwwResult.body && !wwwResult.blockedByBotProtection) {
        return processSitemapBody(wwwResult.body, `https://www.${domain}/sitemap.xml`);
      }

      const wwwGzResult = await fetchSitemapUrl(`https://www.${domain}/sitemap.xml.gz`);
      if (wwwGzResult && wwwGzResult.status === 200 && wwwGzResult.body && !wwwGzResult.blockedByBotProtection) {
        return processSitemapBody(wwwGzResult.body, `https://www.${domain}/sitemap.xml.gz`);
      }
    }

    // If not found, check robots.txt for Sitemap: directive
    const robotsResult = await fetchPath(domain, "/robots.txt");

    if (robotsResult && robotsResult.status === 200 && robotsResult.body) {
      const sitemapUrl = extractSitemapUrlFromRobots(robotsResult.body);

      if (sitemapUrl) {
        const sitemapResult = await fetchSitemapUrl(sitemapUrl);

        if (
          sitemapResult &&
          sitemapResult.status === 200 &&
          sitemapResult.body &&
          !sitemapResult.blockedByBotProtection
        ) {
          return processSitemapBody(sitemapResult.body, sitemapUrl);
        }
      }
    }

    // If bot protection blocked us, the sitemap likely exists — give partial credit
    const blocked = result?.blockedByBotProtection || wwwResult?.blockedByBotProtection;
    if (blocked) {
      const sitemapUrl = result?.blockedByBotProtection
        ? `https://${domain}/sitemap.xml`
        : `https://www.${domain}/sitemap.xml`;
      return {
        pass: true,
        hasSitemap: true,
        entryCount: 0,
        sitemapUrl,
        blockedByBotProtection: true,
        aiRelevantEntries: 0,
        aiRelevantUrls: [],
      };
    }

    return {
      pass: false,
      hasSitemap: false,
      entryCount: 0,
      aiRelevantEntries: 0,
      aiRelevantUrls: [],
    };
  } catch (err) {
    return {
      pass: false,
      hasSitemap: false,
      entryCount: 0,
      aiRelevantEntries: 0,
      aiRelevantUrls: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default checkSitemap;
