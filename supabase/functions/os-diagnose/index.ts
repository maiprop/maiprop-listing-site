/**
 * os-diagnose — enhanced to also extract auction endpoints from live API docs
 * and run a real auction fetch with the working token.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getOsToken(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  // OS wraps token under data.token
  const token = data?.data?.token ?? data.token ?? data.accessToken ?? data.access_token;
  if (!token) throw new Error(`Auth failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const OS_URL   = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "") ?? "";
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL") ?? "";
  const OS_PASS  = Deno.env.get("MAIPROP_OS_PASSWORD") ?? "";

  try {
    // 1. Auth
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // 2. Fetch api-docs to extract endpoint list
    const docsRes = await fetch(`${OS_URL}/v3/api-docs`);
    const docs = await docsRes.json();
    const paths = Object.keys(docs.paths ?? {});
    const auctionPaths = paths.filter(p => p.toLowerCase().includes("auction"));
    const listingPaths = paths.filter(p => p.toLowerCase().includes("listing") || p.toLowerCase().includes("property"));
    const firesalePaths = paths.filter(p => p.toLowerCase().includes("firesale") || p.toLowerCase().includes("opportunity") || p.toLowerCase().includes("instant"));
    const allRelevant = [...auctionPaths, ...listingPaths, ...firesalePaths];

    // 3. Try the auction filter endpoint
    const probeEndpoint = body.endpoint ?? "/api/v1/auctions/filter/details";
    const probeBody = body.probeBody ?? { page: 0, size: 5 };

    const auctRes = await fetch(`${OS_URL}${probeEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(probeBody),
    });
    const auctText = await auctRes.text();
    let auctParsed: any = null;
    try { auctParsed = JSON.parse(auctText); } catch { /* ignore */ }

    // 4. Also surface the schema for AuctionOutputDto if present
    const schemas = docs.components?.schemas ?? {};
    const auctionSchema = schemas["AuctionOutputDto"] ?? schemas["AuctionDto"] ?? schemas["AuctionResponse"] ?? null;
    const listingSchema = schemas["ListingDto"] ?? schemas["PropertyDto"] ?? schemas["ListingOutputDto"] ?? null;

    return new Response(JSON.stringify({
      auth: "✅ OK",
      tokenPreview: token.slice(0, 40) + "...",
      relevantEndpoints: {
        auction: auctionPaths,
        listing: listingPaths,
        firesale: firesalePaths,
        allRelevant,
      },
      auctionProbe: {
        endpoint: probeEndpoint,
        status: auctRes.status,
        body: auctText.slice(0, 2000),
        parsed: auctParsed ? {
          type: Array.isArray(auctParsed) ? "array" : typeof auctParsed,
          topKeys: Array.isArray(auctParsed) ? Object.keys(auctParsed[0] ?? {}) : Object.keys(auctParsed),
          contentKeys: auctParsed?.content ? Object.keys(auctParsed.content[0] ?? {}) : null,
          totalElements: auctParsed?.totalElements ?? null,
          size: Array.isArray(auctParsed) ? auctParsed.length : auctParsed?.content?.length ?? null,
        } : null,
      },
      schemas: {
        auctionSchema: auctionSchema ? Object.keys(auctionSchema?.properties ?? {}) : "not found",
        listingSchema: listingSchema ? Object.keys(listingSchema?.properties ?? {}) : "not found",
      },
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
