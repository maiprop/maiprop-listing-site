/**
 * os-diagnose — probes the OS API to understand data shape, filters, and
 * how many PENDING (future) auctions are available.
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
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const authHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    };

    // Probe 1: count with no filter (all auctions)
    const countAllRes = await fetch(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const countAll = await countAllRes.json().catch(() => null);

    // Probe 2: count with auctionStatus=PENDING
    const countPendingRes = await fetch(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ auctionStatus: "PENDING" }),
    });
    const countPending = await countPendingRes.json().catch(() => null);

    // Probe 3: count with auctionStatus=COMPLETED
    const countCompletedRes = await fetch(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ auctionStatus: "COMPLETED" }),
    });
    const countCompleted = await countCompletedRes.json().catch(() => null);

    // Probe 4: try dateFrom filter on /filter/details
    const today = new Date().toISOString().split("T")[0];
    const futureFilterRes = await fetch(`${OS_URL}/api/v1/auctions/filter/details`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ page: 0, pageSize: 5, dateFrom: today }),
    });
    const futureFilter = await futureFilterRes.json().catch(() => null);
    const futureFilterItems: any[] = futureFilter?.data ?? [];
    const futureSample = futureFilterItems.slice(0, 3).map((a: any) => ({
      id: a.auctionListingId,
      date: a.auctionDate,
      status: a.auctionStatus,
    }));

    // Probe 5: PENDING filter on /filter/details
    const pendingFilterRes = await fetch(`${OS_URL}/api/v1/auctions/filter/details`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ page: 0, pageSize: 5, auctionStatus: "PENDING" }),
    });
    const pendingFilter = await pendingFilterRes.json().catch(() => null);
    const pendingItems: any[] = pendingFilter?.data ?? [];
    const pendingSample = pendingItems.slice(0, 3).map((a: any) => ({
      id: a.auctionListingId,
      date: a.auctionDate,
      status: a.auctionStatus,
    }));

    // Probe 6: count-comparison endpoint (shows PENDING vs COMPLETED split)
    const compRes = await fetch(`${OS_URL}/api/v1/auctions/filter/count-comparison`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const comp = await compRes.json().catch(() => null);

    // Fetch api-docs for endpoint listing
    const docsRes = await fetch(`${OS_URL}/v3/api-docs`);
    const docs = await docsRes.json().catch(() => ({}));
    const paths = Object.keys(docs.paths ?? {});
    const auctionPaths = paths.filter(p => p.toLowerCase().includes("auction"));

    return new Response(JSON.stringify({
      auth: "✅ OK",
      counts: {
        all:       countAll,
        pending:   countPending,
        completed: countCompleted,
        comparison: comp,
      },
      filters: {
        dateFromWorks:   futureFilter?.responseMetadata?.pagination?.totalElements !== countAll?.responseMetadata?.pagination?.totalElements,
        dateFromTotal:   futureFilter?.responseMetadata?.pagination?.totalElements,
        dateFromSample:  futureSample,
        pendingFilter:   pendingFilter?.responseMetadata?.pagination?.totalElements,
        pendingFilterWorks: pendingFilter?.responseMetadata?.pagination?.totalElements !== countAll?.responseMetadata?.pagination?.totalElements,
        pendingSample:   pendingSample,
      },
      auctionEndpoints: auctionPaths,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
