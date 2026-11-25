import type { Check, HttpResponse } from "../../core/types.js";

/**
 * Check HTTP status from a pre-fetched page response.
 * Does NOT make any HTTP calls -- takes the already-fetched response.
 */
export function checkHttpStatus(pageResponse: HttpResponse): Check {
  const id = "http_status";
  const label = "HTTP Status";

  if (pageResponse.ok) {
    const { status, redirects, url } = pageResponse;

    const data =
      redirects.length > 0
        ? { statusCode: status, redirects, finalUrl: url }
        : { statusCode: status };

    if (status >= 200 && status < 300) {
      return {
        id,
        label,
        status: "pass",
        detail: `HTTP ${status} OK`,
        data,
      };
    }

    // Redirect status with ok:true (unusual since httpGet follows redirects)
    if (status >= 300 && status < 400) {
      return {
        id,
        label,
        status: "partial",
        detail: `HTTP ${status} redirect`,
        data,
      };
    }

    // Shouldn't reach here with ok:true, but handle gracefully
    return {
      id,
      label,
      status: "pass",
      detail: `HTTP ${status}`,
      data,
    };
  }

  // Failure cases
  const { kind, message, statusCode } = pageResponse.error;

  switch (kind) {
    case "bot_protected":
      return {
        id,
        label,
        status: "fail",
        detail: "Bot protection detected",
        data: { statusCode, errorKind: kind },
      };

    case "timeout":
      return {
        id,
        label,
        status: "fail",
        detail: "Request timed out",
        data: { errorKind: kind },
      };

    case "http_error":
      return {
        id,
        label,
        status: "fail",
        detail: statusCode ? `HTTP ${statusCode}` : message,
        data: { statusCode, errorKind: kind },
      };

    case "request_budget_exhausted":
      return {
        id,
        label,
        status: "error",
        detail: "HTTP status probe skipped: scan request budget exhausted",
      };

    default:
      return {
        id,
        label,
        status: "fail",
        detail: message,
      };
  }
}
