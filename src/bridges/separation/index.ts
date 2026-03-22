import type { BridgeResult, Check, ContentSource, ScanContext } from "../../core/types.js";
import { checkApiPresence } from "./api-presence.js";
import { checkDeveloperDocs } from "./developer-docs.js";
import { checkSdkReferences } from "./sdk-references.js";
import { checkWebhookSupport } from "./webhook-support.js";

/**
 * Run Bridge 3: Separation.
 *
 * Runs 4 checks to detect API/developer separation signals:
 *   - 1 async HTTP probe (developer docs) fired first (non-blocking)
 *   - 3 synchronous pure-function checks (api presence, SDK references, webhook support)
 *
 * Unlike Bridges 1-2, Bridge 3 is a detection inventory with NO scoring.
 * Returns score: null and scoreLabel: null.
 *
 * Reads from ctx.shared (openApiDetected, pageBody, pageHeaders, llmsTxtBody)
 * set by Bridges 1 and 2. Writes ctx.shared.devDocsBodies with fetched
 * developer documentation page bodies.
 *
 * Assembles ContentSource[] from homepage body, llms.txt body, and developer
 * docs page bodies, then passes to all three pure-function checks.
 */
export async function runSeparationBridge(
  ctx: ScanContext,
): Promise<BridgeResult> {
  const start = performance.now();

  // Extract shared context with safe defaults
  const pageBody = (ctx.shared.pageBody as string) ?? "";
  const pageHeaders =
    (ctx.shared.pageHeaders as Record<string, string>) ?? {};
  const openApiDetected = (ctx.shared.openApiDetected as boolean) ?? false;
  const openApiHasWebhooks = (ctx.shared.openApiHasWebhooks as boolean) ?? false;
  const openApiHasCallbacks = (ctx.shared.openApiHasCallbacks as boolean) ?? false;
  const graphqlDetected = (ctx.shared.graphqlDetected as boolean) ?? false;
  const llmsTxtBody = (ctx.shared.llmsTxtBody as string | undefined) ?? null;

  // Fire async developer docs probe first (non-blocking)
  const devDocsPromise = checkDeveloperDocs(
    ctx.baseUrl,
    pageBody,
    ctx.options.timeout,
  );

  // Await async check (need pages for content sources)
  const devDocsResult = await devDocsPromise;

  // Store dev docs pages in shared context for downstream bridges
  ctx.shared.devDocsBodies = devDocsResult.pages;

  // Assemble content sources from all available bodies
  const contentSources: ContentSource[] = [];
  if (pageBody) contentSources.push({ content: pageBody, source: "homepage" });
  if (llmsTxtBody) contentSources.push({ content: llmsTxtBody, source: "llms.txt" });
  contentSources.push(...devDocsResult.pages);

  // Run 3 synchronous pure-function checks with assembled content sources
  const apiPresenceCheck = checkApiPresence(openApiDetected, contentSources, pageHeaders, graphqlDetected);
  const sdkRefsCheck = checkSdkReferences(contentSources);
  const webhookCheck = checkWebhookSupport(contentSources, {
    pageHeaders,
    openApiHasWebhooks,
    openApiHasCallbacks,
  });

  // Assemble checks array in order
  const checks: Check[] = [
    apiPresenceCheck,
    devDocsResult.check,
    sdkRefsCheck,
    webhookCheck,
  ];

  return {
    id: 3,
    name: "Separation",
    status: "evaluated",
    score: null,
    scoreLabel: null,
    checks,
    durationMs: Math.round(performance.now() - start),
  };
}
