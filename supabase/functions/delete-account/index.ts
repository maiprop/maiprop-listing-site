/**
 * delete-account
 * ─────────────────────────────────────────────────────────────────────────────
 * Permanently deletes the authenticated user's account from Supabase Auth.
 * Requires a valid Bearer token (verify_jwt = true in config.toml).
 *
 * GDPR Article 17 (right to erasure) cleanup, run BEFORE auth.admin.deleteUser
 * because the listings.owner_id FK was dropped in 20260309120114 to support
 * OS-imported listings — without that FK, deleting the auth.users row would
 * orphan the user's listings as publicly-active rows that nobody can manage:
 *
 *   1. HARD DELETE listings owned by the user. Cascades to listing_images,
 *      favorites, viewings, open_house_*, listing_view_events, new_building_leads.
 *      We do NOT soft-delete because (a) listing_status enum has no 'deleted'
 *      value and adding one risks RLS regressions, and (b) GDPR Article 17
 *      requires actual erasure of personal data.
 *   2. Cancel any active/trialing Stripe subscriptions  (stop billing).
 *   3. Empty all storage paths owned by the user across every bucket the user
 *      can write to:
 *        - listing-images / avatars       : `${user.id}/<file>`             (flat, 1 level)
 *        - project-media                  : `${user.id}/<projectId>/<file>`  (nested, 2 levels)
 *        - message-attachments            : `${user.id}/<convId>/<file>`     (nested, 2 levels)
 *        - open-house-docs                : `${user.id}/.../<file>`          (POF / ID docs)
 *        - firesale-photos                : `${firesaleRequestId}/<file>`    (NOT under user.id)
 *      Buckets that put user.id at the top of the path are walked recursively
 *      by `removeFolderRecursive(supabase, bucket, user.id)`. firesale-photos
 *      requires a `firesale_requests.user_id = ?` lookup first because the
 *      photos are filed under the request id.
 *
 * Post-delete: ON DELETE CASCADE handles profiles, favorites, viewings, leads,
 *   professionals, and every other table with a FK to auth.users.
 */

import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const log = createLogger("delete-account");
const limiter = makeRateLimiter({ bucket: "delete-account", maxRequests: 3, windowMs: 60_000 });

export const USER_FOLDER_BUCKETS = [
  "listing-images",
  "avatars",
  "project-media",
  "message-attachments",
  "open-house-docs",
] as const;

type DbError = { code?: string; message?: string } | null;
type QueryResult<T> = { data: T[] | null; error: DbError };
type InsertResult = { error: DbError };
type TableQuery = {
  select: (columns: string) => TableQuery;
  eq: (column: string, value: unknown) => TableQuery & PromiseLike<QueryResult<unknown>>;
  in: (column: string, values: string[]) => TableQuery & PromiseLike<QueryResult<unknown>>;
  or: (filter: string) => TableQuery & PromiseLike<QueryResult<unknown>>;
  insert: (rows: Array<Record<string, unknown>>) => Promise<InsertResult>;
};
type DeletionNotificationClient = {
  from: (table: string) => TableQuery;
};

type OwnedListing = { id: string };
type FavoriteRow = { user_id: string | null; listing_id: string | null };
type ViewingRow = { requester_id: string | null; listing_id: string | null };
type OpenHouseRegistrationRow = { requester_id: string | null; listing_id: string | null };
type OpenHouseOfferRow = { bidder_id: string | null; listing_id: string | null };
type ConversationRow = { participant_a: string | null; participant_b: string | null };

export type DeletionNotification = {
  user_id: string;
  title: string;
  body: string;
  type: string;
  link?: string;
};

Deno.serve(async (req) => { // skipcq: JS-R1005 - Account deletion coordinates auth, storage cleanup, DB removal, and error reporting in order.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const user = await verifyBearerToken(req, supabase);

    await notifyAccountDeletionAffectedParties(
      supabase as unknown as DeletionNotificationClient,
      user.id,
    ).catch((notifyErr: unknown) => {
      log.warn("account deletion notification prep failed", {
        user_id: user.id,
        err: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    });

    // 1) HARD DELETE listings BEFORE the auth row is removed. The FK was dropped
    //    in 20260309120114, so this must run explicitly. Cascades clean up
    //    listing_images, favorites, viewings, open_house_*, etc.
    const { error: listingsErr } = await supabase
      .from("listings")
      .delete()
      .eq("owner_id", user.id);
    if (listingsErr) {
      log.warn("listings cleanup failed", { user_id: user.id, err: listingsErr.message });
    }

    // 2) Cancel active/trialing Stripe subscriptions so the user is not billed
    //    after deletion. Best-effort: a Stripe outage must not block account deletion.
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        let customerId: string | null = null;
        try {
          const search = await stripe.customers.search({
            query: `metadata['user_id']:'${user.id}'`,
            limit: 1,
          });
          if (search.data[0]) customerId = search.data[0].id;
        } catch (_searchErr) {
          // Search API may not be enabled — fall through to email lookup.
        }
        if (!customerId) {
          const byEmail = await stripe.customers.list({ email: user.email, limit: 1 });
          if (byEmail.data[0]) customerId = byEmail.data[0].id;
        }
        if (customerId) {
          const active = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 100 });
          await Promise.all(active.data.map((s: Stripe.Subscription) =>
            stripe.subscriptions.cancel(s.id).catch(() => undefined),
          ));
          const trialing = await stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 100 });
          await Promise.all(trialing.data.map((s: Stripe.Subscription) =>
            stripe.subscriptions.cancel(s.id).catch(() => undefined),
          ));
        }
      } catch (stripeErr) {
        log.warn("stripe cleanup failed", {
          user_id: user.id,
          err: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
        });
      }
    }

    // 3a) Buckets where the path starts with `${user.id}/` — list recursively.
    //     project-media nests `${user.id}/${projectId}/`, listing-images and
    //     avatars are flat; the recursive walker handles both.
    for (const bucket of USER_FOLDER_BUCKETS) {
      try {
        await removeFolderRecursive(supabase, bucket, user.id);
      } catch (storageErr) {
        log.warn("storage cleanup failed", {
          user_id: user.id,
          bucket,
          err: storageErr instanceof Error ? storageErr.message : String(storageErr),
        });
      }
    }

    // 3b) firesale-photos: paths are `${firesaleRequestId}/<file>`; user.id is
    //     not in the path. Look up every firesale_request the user owns, then
    //     wipe each request's folder.
    try {
      const { data: requests } = await supabase
        .from("firesale_requests")
        .select("id")
        .eq("user_id", user.id);
      for (const r of (requests ?? []) as Array<{ id: string }>) {
        await removeFolderRecursive(supabase, "firesale-photos", r.id);
      }
    } catch (firesaleErr) {
      log.warn("firesale-photos cleanup failed", {
        user_id: user.id,
        err: firesaleErr instanceof Error ? firesaleErr.message : String(firesaleErr),
      });
    }

    // (message-attachments cleanup is handled by the USER_FOLDER_BUCKETS loop
    //  above now that paths are ${user.id}/${convId}/<file>.)

    // 4) Delete from auth.users — cascades the remaining FK-bound rows.
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;

    log.info("user deleted", { user_id: user.id });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("delete-account error", { err: message });
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function addDeletionNotification(
  notifications: DeletionNotification[],
  deletedUserId: string,
  userId: string | null | undefined,
  title: string,
  body: string,
  type: string,
  link: string,
) {
  if (!userId || userId === deletedUserId) return;
  notifications.push({ user_id: userId, title, body, type, link });
}

async function selectRows<T>(
  label: string,
  query: PromiseLike<QueryResult<T>>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    log.warn("account deletion notification lookup failed", { table: label, err: error.message });
    return [];
  }
  return data ?? [];
}

export function dedupeDeletionNotifications(
  notifications: DeletionNotification[],
): DeletionNotification[] {
  const seen = new Set<string>();
  return notifications.filter((notification) => {
    const key = [
      notification.user_id,
      notification.title,
      notification.body,
      notification.type,
      notification.link ?? "",
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function insertDeletionNotifications(
  supabase: DeletionNotificationClient,
  notifications: DeletionNotification[],
): Promise<void> {
  const rows = dedupeDeletionNotifications(notifications);
  if (rows.length === 0) return;

  const rowsWithLink: Array<Record<string, unknown>> = rows.map((notification) => ({ ...notification }));
  const { error } = await supabase.from("notifications").insert(rowsWithLink);
  if (!error) return;

  const linkColumnMissing = error.code === "42703" || /column .*link/i.test(error.message ?? "");
  if (!linkColumnMissing) throw new Error(error.message ?? "notification_insert_failed");

  const rowsWithoutLink: Array<Record<string, unknown>> = rows.map(({ link: _link, ...row }) => row);
  const { error: fallbackError } = await supabase.from("notifications").insert(rowsWithoutLink);
  if (fallbackError) throw new Error(fallbackError.message ?? "notification_insert_failed");
}

export async function notifyAccountDeletionAffectedParties(
  supabase: DeletionNotificationClient,
  deletedUserId: string,
): Promise<void> {
  const listings = await selectRows<OwnedListing>(
    "listings",
    supabase
      .from("listings")
      .select("id")
      .eq("owner_id", deletedUserId) as unknown as PromiseLike<QueryResult<OwnedListing>>,
  );
  const listingIds = listings.map((listing) => listing.id).filter(Boolean);
  const notifications: DeletionNotification[] = [];

  if (listingIds.length > 0) {
    const favorites = await selectRows<FavoriteRow>(
      "favorites",
      supabase
        .from("favorites")
        .select("user_id, listing_id")
        .in("listing_id", listingIds) as unknown as PromiseLike<QueryResult<FavoriteRow>>,
    );
    for (const favorite of favorites) {
      addDeletionNotification(
        notifications,
        deletedUserId,
        favorite.user_id,
        "Saved listing removed",
        "A listing you saved is no longer available.",
        "listing_removed",
        "/dashboard?tab=saved",
      );
    }

    const viewings = await selectRows<ViewingRow>(
      "viewings",
      supabase
        .from("viewings")
        .select("requester_id, listing_id")
        .in("listing_id", listingIds) as unknown as PromiseLike<QueryResult<ViewingRow>>,
    );
    for (const viewing of viewings) {
      addDeletionNotification(
        notifications,
        deletedUserId,
        viewing.requester_id,
        "Viewing cancelled",
        "Your viewing was cancelled because the listing is no longer available.",
        "viewing",
        "/dashboard?tab=viewings",
      );
    }

    const registrations = await selectRows<OpenHouseRegistrationRow>(
      "open_house_registrations",
      supabase
        .from("open_house_registrations")
        .select("requester_id, listing_id")
        .in("listing_id", listingIds) as unknown as PromiseLike<QueryResult<OpenHouseRegistrationRow>>,
    );
    for (const registration of registrations) {
      addDeletionNotification(
        notifications,
        deletedUserId,
        registration.requester_id,
        "Open house registration closed",
        "Your open house registration was closed because the listing is no longer available.",
        "open_house",
        "/dashboard?tab=open-houses",
      );
    }

    const offers = await selectRows<OpenHouseOfferRow>(
      "open_house_offers",
      supabase
        .from("open_house_offers")
        .select("bidder_id, listing_id")
        .in("listing_id", listingIds) as unknown as PromiseLike<QueryResult<OpenHouseOfferRow>>,
    );
    for (const offer of offers) {
      addDeletionNotification(
        notifications,
        deletedUserId,
        offer.bidder_id,
        "Open house bid closed",
        "Your open house bid was closed because the listing is no longer available.",
        "open_house_offer",
        "/dashboard?tab=open-houses",
      );
    }
  }

  const conversations = await selectRows<ConversationRow>(
    "conversations",
    supabase
      .from("conversations")
      .select("participant_a, participant_b")
      .or(`participant_a.eq.${deletedUserId},participant_b.eq.${deletedUserId}`) as unknown as PromiseLike<QueryResult<ConversationRow>>,
  );
  for (const conversation of conversations) {
    const otherUserId = conversation.participant_a === deletedUserId
      ? conversation.participant_b
      : conversation.participant_a;
    addDeletionNotification(
      notifications,
      deletedUserId,
      otherUserId,
      "Conversation closed",
      "A conversation was closed because the other account is no longer available.",
      "message",
      "/messages",
    );
  }

  await insertDeletionNotifications(supabase, notifications);
}

/**
 * Recursively delete every object inside `prefix` of `bucket`.
 *
 * Supabase storage's `list()` API returns immediate children only, with files
 * having `id !== null` and folders having `id === null`. We walk depth-first
 * up to a sane depth limit to guard against pathological structures.
 *
 * Structural type used instead of `SupabaseClient` to sidestep a generic
 * narrowing mismatch between the Deno-edge `createClient()` return type and
 * `ReturnType<typeof createClient>` seen in this repo's edge functions.
 */
type StorageSubset = {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        options?: { limit?: number },
      ) => Promise<{ data: Array<{ id: string | null; name: string }> | null; error: unknown }>;
      remove: (paths: string[]) => Promise<unknown>;
    };
  };
};

export async function removeFolderRecursive( // skipcq: JS-R1005 - Recursive storage cleanup handles pagination, nested prefixes, and partial deletion errors.
  supabase: StorageSubset,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<void> {
  if (depth > 4) return; // bucket layouts in this app go at most 2 levels deep
  const { data: entries, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !entries || entries.length === 0) return;

  // Files have a non-null id; folders return id=null.
  type Entry = { id: string | null; name: string };
  const list: Entry[] = entries as Entry[];
  const files = list.filter((e: Entry) => e.id !== null).map((e: Entry) => `${prefix}/${e.name}`);
  if (files.length > 0) {
    await supabase.storage.from(bucket).remove(files);
  }
  const folders = list.filter((e: Entry) => e.id === null);
  for (const f of folders) {
    await removeFolderRecursive(supabase, bucket, `${prefix}/${f.name}`, depth + 1);
  }
}
