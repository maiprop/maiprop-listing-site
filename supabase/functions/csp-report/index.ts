import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  const headers = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers });
  }

  try {
    const body = await req.json();
    const report = body["csp-report"] ?? body;
    console.error(
      JSON.stringify({
        level: "warn",
        event: "csp_violation",
        blocked_uri: report["blocked-uri"] ?? report.blockedURL ?? "unknown",
        document_uri: report["document-uri"] ?? report.documentURL ?? "unknown",
        violated_directive: report["violated-directive"] ?? report.effectiveDirective ?? "unknown",
        source_file: report["source-file"] ?? report.sourceFile ?? null,
        line_number: report["line-number"] ?? report.lineNumber ?? null,
        alert: true,
      }),
    );
  } catch {
    console.error(JSON.stringify({ level: "warn", event: "csp_violation", reason: "invalid report body", alert: true }));
  }

  return new Response(null, { status: 204, headers });
});
