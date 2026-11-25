import type { Check, ScanContext } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";
import { observeProbe, selectProbe } from "./probe.js";

const RATE_LIMIT_HEADERS = ["ratelimit-limit", "x-ratelimit-limit", "x-rate-limit-limit"];
const RETRY_AFTER = "retry-after";

const id = "context_rate_limit_headers";
const label = "Rate Limit Headers";

export async function checkRateLimitHeaders(ctx: ScanContext): Promise<Check> {
  const selected = selectProbe(ctx, "rate");
  const timeout = Math.min(ctx.options.timeout ?? 10000, 5000);
  const result = await httpGet(selected.probeUrl, { timeout });
  const { data, response, attributable, html } = observeProbe(selected, result);
  const { httpStatus } = data;
  const eligible = result.ok || ((!result.ok && result.error.kind === "http_error") && (httpStatus === 401 || httpStatus === 403)) || httpStatus === 429;

  ctx.shared.contextProbeHeaders = {};
  if (attributable && !html && eligible && response) {
    ctx.shared.contextProbeHeaders = response.headers;
    const limit = RATE_LIMIT_HEADERS.find(name => response.headers[name]?.trim());
    const headerFound = limit ?? (response.headers[RETRY_AFTER]?.trim() ? RETRY_AFTER : null);
    if (headerFound || selected.probeSource === "operation") {
      return { id, label, status: limit ? "pass" : headerFound ? "partial" : "fail",
        detail: headerFound ? `Rate-limit header observed: ${headerFound}` : "No rate-limit headers found in response",
        data: { ...data, headerFound, measurement: "measured" },
      };
    }
  }
  return { id, label, status: "error",
    detail: `Rate-limit guidance could not be measured for the selected GET (${httpStatus === null ? "no HTTP response" : `HTTP ${httpStatus}`})`,
    data: { ...data, headerFound: null, measurement: "unmeasured", ...(!result.ok && { errorKind: result.error.kind }) },
  };
}
