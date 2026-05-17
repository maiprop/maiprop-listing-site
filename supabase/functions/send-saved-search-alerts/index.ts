/**
 * send-saved-search-alerts
 *
 * Fetches saved searches with email_alerts=true, runs each against listings,
 * and sends an email when new matches appear. Designed to run via pg_cron (e.g. every 6h).
 *
 * Env: BREVO_API_KEY (optional - if not set, logs only), MAIPROP_APP_URL (for links)
 * Invoke: POST with empty body or cron.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const structuredLog = createLogger("send-saved-search-alerts");

// Redirect the legacy `log(msg, data?)` helper through the structured logger
// so all existing call sites emit JSON without modification.
function log(msg: string, data?: unknown) {
  structuredLog.info(msg, data && typeof data === "object" ? data as Record<string, unknown> : data !== undefined ? { data } : undefined);
}

// Prevent unauthenticated callers from triggering bulk email sends.
// The pg_cron job must pass Authorization: Bearer <CRON_SECRET>.
// Set CRON_SECRET in Supabase edge function secrets.
// Fails CLOSED: if the secret is not configured, the function rejects all
// requests rather than allowing unauthenticated access.
function verifyCronSecret(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) {
    structuredLog.error("CRON_SECRET not configured, rejecting request");
    return false;
  }
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function propertyUrl(appUrl: string, id: string): string {
  return `${appUrl.replace(/\/$/, "")}/property/${encodeURIComponent(id)}`;
}

function buildListingsQuery(supabase: SupabaseClient, filters: Record<string, unknown>) {
  let query = supabase
    .from("listings")
    .select("id, title, city, price, cover_image_url, listing_type")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);

  const f = filters as Record<string, string>;
  if (f.city) query = query.ilike("city", `%${f.city}%`);
  if (f.listing_type) query = query.eq("listing_type", f.listing_type);
  if (f.type || f.property_type) query = query.eq("property_type", f.type || f.property_type);
  if (f.price) {
    const [min, max] = (f.price || "").split("-").map(Number);
    if (!isNaN(min) && min > 0) query = query.gte("price", min);
    if (!isNaN(max) && max > 0) query = query.lte("price", max);
  }
  if (f.beds_min) query = query.gte("bedrooms", parseInt(f.beds_min, 10));
  if (f.beds_max) query = query.lte("bedrooms", parseInt(f.beds_max, 10));
  if (f.sqm_min) query = query.gte("sqm", parseInt(f.sqm_min, 10));
  if (f.sqm_max) query = query.lte("sqm", parseInt(f.sqm_max, 10));

  return query;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (!verifyCronSecret(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  const BREVO_KEY = Deno.env.get("BREVO_API_KEY");
  const APP_URL = Deno.env.get("MAIPROP_APP_URL") || "https://portal.maiprop.co/";
  const FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") || "alerts@maiprop.co";

  try {
    const { data: searches, error: searchError } = await supabase
      .from("saved_searches")
      .select("id, user_id, name, filters, last_alert_listing_ids")
      .eq("email_alerts", true);

    if (searchError) throw searchError;
    if (!searches || searches.length === 0) {
      log("No saved searches with alerts");
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let sent = 0;

    for (const s of searches) {
      const filters = (s.filters as Record<string, unknown>) || {};
      const { data: listings, error: listError } = await buildListingsQuery(supabase, filters);

      if (listError) {
        log("Listings query error for search " + s.id, listError);
        continue;
      }

      const listingIds = (listings || []).map((l: { id: string }) => l.id);
      const prevIds = (s.last_alert_listing_ids as string[]) || [];
      const newIds = listingIds.filter((id: string) => !prevIds.includes(id));

      if (newIds.length === 0 && prevIds.length > 0) {
        continue; // No new listings, skip
      }

      const { data: authUser } = await supabase.auth.admin.getUserById(s.user_id);
      const email = authUser?.user?.email;
      if (!email) {
        log("No email for user " + s.user_id);
        continue;
      }

      const listingsToSend = (listings || []).filter(
        (l: { id: string }) => newIds.includes(l.id) || prevIds.length === 0,
      );
      if (listingsToSend.length === 0) continue;

      const listHtml = listingsToSend
        .map(
          (l: { id: string; title: string; city: string; price: number }) =>
            `<li><a href="${escapeHtml(propertyUrl(APP_URL, l.id))}">${escapeHtml(l.title)}</a> &middot; ${escapeHtml(l.city || "")} &middot; EUR ${Number(l.price || 0).toLocaleString()}</li>`,
        )
        .join("");

      const subject = `maiProp: ${listingsToSend.length} new match${listingsToSend.length > 1 ? "es" : ""} for "${s.name}"`;
      const searchName = escapeHtml(s.name);
      const listingsUrl = escapeHtml(`${APP_URL.replace(/\/$/, "")}/listings`);
      const html = `
        <h2>Your saved search "${searchName}" has new matches</h2>
        <ul>${listHtml}</ul>
        <p><a href="${listingsUrl}">View all listings</a></p>
      `;

      if (BREVO_KEY) {
        const res = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": BREVO_KEY,
          },
          body: JSON.stringify({
            sender: { email: FROM_EMAIL, name: "maiProp Alerts" },
            to: [{ email }],
            subject,
            htmlContent: html,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          log("Brevo error", { status: res.status, err });
          continue;
        }
        sent++;
      } else {
        log("BREVO_API_KEY not set, skipping email", { to: email, subject, count: listingsToSend.length });
      }

      await supabase
        .from("saved_searches")
        .update({
          last_alert_sent_at: new Date().toISOString(),
          last_alert_listing_ids: listingIds,
        })
        .eq("id", s.id);
    }

    return new Response(JSON.stringify({ ok: true, processed: searches.length, emailsSent: sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    log("ERROR", (err as Error).message);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
