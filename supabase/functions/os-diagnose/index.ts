/**
 * os-diagnose — probes the OS API to understand data shape, filters, and
 * how many PENDING (future) auctions are available.
 * Also probes the new GET /api/auctions/future endpoint directly.
 */

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

  const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "") ?? "";
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL") ?? "";
  const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD") ?? "";

  try {
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // ── Probe 1: GET /api/auctions/future (new endpoint) ──────────────────────
    const futureUrl = `${OS_URL}/api/auctions/future?limit=5`;
    const futureRes = await fetch(futureUrl, { headers: authHeaders });
    const futureJson = await futureRes.json().catch(() => null);
    const futureTotal: number = futureJson?.total ?? futureJson?.data?.length ?? 0;
    const futureSample = (futureJson?.data ?? []).slice(0, 3).map((a: any) => ({
      id: a.id,
      title: a.title,
      city: a.city,
      auction_date: a.auction_date,
      starting_price: a.starting_price,
      status: a.status,
      has_lat: a.lat != null,
      has_lng: a.lng != null,
    }));

    // ── Probe 2: count all via /api/v1/auctions/filter/count ──────────────────
    const countAllRes = await fetch(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const countAll = await countAllRes.json().catch(() => null);

    // ── Probe 3: count PENDING auctions ───────────────────────────────────────
    const countPendingRes = await fetch(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ auctionStatus: "PENDING" }),
    });
    const countPending = await countPendingRes.json().catch(() => null);

    // ── Probe 4: count COMPLETED auctions ─────────────────────────────────────
    const countCompletedRes = await fetch(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ auctionStatus: "COMPLETED" }),
    });
    const countCompleted = await countCompletedRes.json().catch(() => null);

    // ── Probe 5: count-comparison endpoint ────────────────────────────────────
    // Requires sortBy field to avoid NullPointerException on the OS API side
    const compRes = await fetch(`${OS_URL}/api/v1/auctions/filter/count-comparison`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ sortBy: "auctionDate", sortOrder: "ASC" }),
    });
    const comp = await compRes.json().catch(() => null);

    // ── Probe 6: full future count via /api/auctions/future?limit=9999 ────────
    let futureFullTotal = futureTotal;
    try {
      const fullRes = await fetch(`${OS_URL}/api/auctions/future?limit=9999`, { headers: authHeaders });
      const fullJson = await fullRes.json().catch(() => null);
      futureFullTotal = fullJson?.total ?? fullJson?.data?.length ?? futureTotal;
    } catch (_) {
      /* non-critical */
    }

    return new Response(
      JSON.stringify(
        {
          auth: "✅ OK",
          osReachable: true,
          // ── New endpoint probe ──────────────────────────────────────────────────
          futureAuctionsEndpoint: {
            url: "/api/auctions/future",
            status: futureRes.status,
            available: futureFullTotal,
            sample: futureSample,
            hasCoordinates: futureSample.filter((a: any) => a.has_lat).length,
          },
          // ── Legacy endpoint probes ──────────────────────────────────────────────
          counts: {
            all: countAll,
            pending: countPending,
            completed: countCompleted,
            comparison: comp,
          },
          detail: `${futureFullTotal} future auctions available at /api/auctions/future`,
        },
        null,
        2,
      ),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: err.message,
        osReachable: false,
        detail: err.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
