import { fetchPath } from "./fetch-utils.js";
import type { HttpHealthCheckResult } from "../types.js";

const USER_AGENT = "milieu-content-score/0.1";

/** Check if HTTP requests are redirected to HTTPS. */
async function checkHttpsEnforcement(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${domain}/`, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
      redirect: "manual",
    });

    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location?.startsWith("https://")) return true;
    }

    return false;
  } catch {
    // Network error or timeout — can't determine, assume not enforced
    return false;
  }
}

/** Strip HTML tags and extract visible text from a body string. */
function extractVisibleText(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch?.[1] || html;

  return bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detect common SPA framework markers in HTML. */
function detectSpaFramework(html: string): string | undefined {
  if (/<div\s+id=["']__next["']/i.test(html)) return "Next.js";
  if (/<div\s+id=["']root["']/i.test(html)) return "React";
  if (/<div\s+id=["']app["']/i.test(html)) return "Vue";
  if (/ng-app|ng-version/i.test(html)) return "Angular";
  return undefined;
}

export async function checkHttpHealth(
  domain: string,
): Promise<HttpHealthCheckResult> {
  try {
    const startTime = Date.now();

    const [httpsEnforced, homepageResult] = await Promise.all([
      checkHttpsEnforcement(domain),
      fetchPath(domain, "/", { timeout: 5000 }),
    ]);

    const ttfbMs = Date.now() - startTime;

    let hasJsFreeContent = false;
    let visibleTextLength = 0;
    let spaFrameworkDetected: string | undefined;
    let hasViewportMeta: boolean | undefined;
    let pageSizeBytes: number | undefined;
    let hasRobotsMetaNoindex: boolean | undefined;

    if (homepageResult?.body && homepageResult.status === 200 && !homepageResult.blockedByBotProtection) {
      const body = homepageResult.body;
      const text = extractVisibleText(body);
      visibleTextLength = text.length;
      hasJsFreeContent = visibleTextLength >= 200;
      spaFrameworkDetected = detectSpaFramework(body);
      hasViewportMeta = /<meta\s[^>]*name\s*=\s*["']viewport["']/i.test(body);
      pageSizeBytes = Buffer.byteLength(body, "utf-8");
      hasRobotsMetaNoindex = /<meta\s[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex[^"']*["']/i.test(body)
        || /<meta\s[^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*name\s*=\s*["']robots["']/i.test(body);
    }

    const textToHtmlRatio = pageSizeBytes && pageSizeBytes > 0
      ? Math.round((visibleTextLength / pageSizeBytes) * 1000) / 10
      : undefined;

    return {
      pass: httpsEnforced && hasJsFreeContent,
      httpsEnforced,
      ttfbMs,
      hasJsFreeContent,
      visibleTextLength,
      spaFrameworkDetected,
      hasViewportMeta,
      pageSizeBytes,
      textToHtmlRatio,
      hasRobotsMetaNoindex,
    };
  } catch (err) {
    return {
      pass: false,
      httpsEnforced: false,
      hasJsFreeContent: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default checkHttpHealth;
