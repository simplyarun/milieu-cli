import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
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
 * Reads from ctx.shared (openApiDetected, pageBody, pageHeaders) set by
 * Bridges 1 and 2. Does NOT write to ctx.shared.
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

  // Fire async developer docs probe first (non-blocking)
  const devDocsPromise = checkDeveloperDocs(
    ctx.baseUrl,
    pageBody,
    ctx.options.timeout,
  );

  // Run 3 synchronous pure-function checks
  const apiPresenceCheck = checkApiPresence(openApiDetected, pageBody, pageHeaders);
  const sdkRefsCheck = checkSdkReferences(pageBody);
  const webhookCheck = checkWebhookSupport(pageBody);

  // Await async check
  const devDocsCheck = await devDocsPromise;

  // Assemble checks array in order
  const checks: Check[] = [
    apiPresenceCheck,
    devDocsCheck,
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
