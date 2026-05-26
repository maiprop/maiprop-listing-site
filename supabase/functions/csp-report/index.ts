import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("csp-report");
const MAX_REPORT_BYTES = 16_384;
const limiter = makeRateLimiter({
  bucket: "csp-report",
  maxRequests: 60,
  windowMs: 60_000,
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(headers);

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REPORT_BYTES) {
    log.warn("csp_violation", { reason: "oversized report body" });
    return new Response(null, { status: 413, headers });
  }

  try {
    const rawBody = await req.text();
    const rawBodyBytes = new TextEncoder().encode(rawBody).length;
    if (rawBodyBytes > MAX_REPORT_BYTES) {
      log.warn("csp_violation", { reason: "oversized report body" });
      return new Response(null, { status: 413, headers });
    }

    const body = JSON.parse(rawBody);
    // Reporting API (report-to): body is an array of {type, url, body: {...}}
    // Legacy report-uri: body is {"csp-report": {...}}
    const reports = Array.isArray(body)
      ? body.map((r) => r.body ?? r)
      : [body["csp-report"] ?? body];

    for (const report of reports) {
      log.warn("csp_violation", {
        blocked_uri: report["blocked-uri"] ?? report.blockedURL ?? "unknown",
        document_uri: report["document-uri"] ?? report.documentURL ?? "unknown",
        violated_directive: report["violated-directive"] ?? report.effectiveDirective ?? "unknown",
        source_file: report["source-file"] ?? report.sourceFile ?? null,
        line_number: report["line-number"] ?? report.lineNumber ?? null,
      });
    }
  } catch {
    log.warn("csp_violation", { reason: "invalid report body" });
  }

  return new Response(null, { status: 204, headers });
});
