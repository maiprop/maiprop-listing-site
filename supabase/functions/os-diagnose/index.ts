/**
 * os-diagnose
 * ─────────────────────────────────────────────────────────────────────────────
 * Diagnostic tool: probes maiProp OS auth endpoint variants and surfaces
 * exact responses so the correct auth path and credential format can be found.
 *
 * Returns a full diagnostic JSON with every attempt's status + body.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function probe(url: string, body: unknown): Promise<{ url: string; status: number; body: string; token?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let token: string | undefined;
    try {
      const j = JSON.parse(text);
      token = j.token ?? j.accessToken ?? j.access_token ?? j.jwt ?? j.bearerToken;
    } catch { /* ignore */ }
    return { url, status: res.status, body: text.slice(0, 800), token };
  } catch (err: any) {
    return { url, status: -1, body: err.message };
  }
}

async function probeGet(url: string): Promise<{ url: string; status: number; body: string }> {
  try {
    const res = await fetch(url, { method: "GET" });
    const text = await res.text();
    return { url, status: res.status, body: text.slice(0, 400) };
  } catch (err: any) {
    return { url, status: -1, body: err.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OS_URL   = Deno.env.get("MAIPROP_OS_URL") ?? "";
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL") ?? "";
  const OS_PASS  = Deno.env.get("MAIPROP_OS_PASSWORD") ?? "";

  if (!OS_URL) {
    return new Response(JSON.stringify({ error: "MAIPROP_OS_URL not set" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Strip trailing slash
  const base = OS_URL.replace(/\/$/, "");

  // Body variants to try
  const bodies = [
    { email: OS_EMAIL, password: OS_PASS },
    { username: OS_EMAIL, password: OS_PASS },
    { login: OS_EMAIL, password: OS_PASS },
    { email: OS_EMAIL, pass: OS_PASS },
  ];

  // Auth endpoint paths to probe
  const authPaths = [
    "/auth/login",
    "/api/auth/login",
    "/api/v1/auth/login",
    "/auth/authenticate",
    "/api/authenticate",
    "/api/v1/authenticate",
    "/login",
    "/api/login",
  ];

  const results: any[] = [];
  let successToken: string | undefined;

  for (const path of authPaths) {
    // Try first body shape — if it looks promising try others
    const r = await probe(`${base}${path}`, bodies[0]);
    results.push({ ...r, bodyUsed: "email+password" });

    if (r.token) {
      successToken = r.token;
      break; // Found a working endpoint
    }

    // If 400/422 (likely wrong field names), try username variant
    if (r.status === 400 || r.status === 422 || r.status === 415) {
      for (const b of bodies.slice(1)) {
        const r2 = await probe(`${base}${path}`, b);
        results.push({ ...r2, bodyUsed: JSON.stringify(b).replace(OS_PASS, "***") });
        if (r2.token) { successToken = r2.token; break; }
      }
      if (successToken) break;
    }
  }

  // Also probe some GET endpoints to check if OS is reachable
  const reachabilityProbes = await Promise.all([
    probeGet(`${base}/`),
    probeGet(`${base}/api/v1/`),
    probeGet(`${base}/swagger-ui.html`),
    probeGet(`${base}/v3/api-docs`),
    probeGet(`${base}/swagger-ui/index.html`),
  ]);

  // If we have a token, try to list auctions
  let auctionProbe: any = null;
  if (successToken) {
    try {
      const ar = await fetch(`${base}/api/v1/auctions/filter/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${successToken}` },
        body: JSON.stringify({ page: 0, size: 2 }),
      });
      const at = await ar.text();
      auctionProbe = { status: ar.status, body: at.slice(0, 1000) };
    } catch (e: any) {
      auctionProbe = { error: e.message };
    }
  }

  const diagnostic = {
    configuredUrl: base,
    emailConfigured: OS_EMAIL.length > 0,
    passwordConfigured: OS_PASS.length > 0,
    successToken: successToken ? "✅ found" : "❌ not found",
    authAttempts: results.map(r => ({
      ...r,
      // mask password in body
      body: r.body.replace(OS_PASS, "***"),
    })),
    reachability: reachabilityProbes,
    auctionProbe,
  };

  console.log("OS Diagnostic result:", JSON.stringify(diagnostic, null, 2));

  return new Response(JSON.stringify(diagnostic, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
