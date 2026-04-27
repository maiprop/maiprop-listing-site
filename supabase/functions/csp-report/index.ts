import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("csp-report");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  const headers = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers });
  }

  try {
    const body = await req.json();
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
