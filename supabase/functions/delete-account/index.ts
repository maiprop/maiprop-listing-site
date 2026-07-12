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
 *        - firesale-proof-docs            : `${user.id}/firesale/.../<file>`  (investor POF docs)
 *        - firesale-photos                : `${firesaleRequestId}/<file>`    (NOT under user.id)
 *      Buckets that put user.id at the top of the path are walked recursively
 *      by `removeFolderRecursive(supabase, bucket, user.id)`. firesale-photos
 *      requires a `firesale_requests.user_id = ?` lookup first because the
 *      photos are filed under the request id.
 *
 * Post-delete: ON DELETE CASCADE handles profiles, favorites, viewings, leads,
 *   professionals, and every other table with a FK to auth.users.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { createStripeClient } from "../_shared/stripeClient.ts";

const log = createLogger("delete-account");
const limiter = makeRateLimiter({ bucket: "delete-account", maxRequests: 3, windowMs: 60_000 });

export const USER_FOLDER_BUCKETS = [
  "listing-images",
  "avatars",
  "project-media",
  "message-attachments",
  "open-house-docs",
  "firesale-proof-docs",
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

export type CriticalDeletionStage =
  | "listings"
  | "subscriptions"
  | "storage"
  | "firesale_photos"
  | "auth";

export type DeletionJobStage = "requested" | CriticalDeletionStage | "completed";

export type AccountDeletionOperations = {
  beginAttempt: (userId: string) => Promise<string>;
  persistStage: (userId: string, attemptId: string, stage: CriticalDeletionStage) => Promise<void>;
  markFailed: (
    userId: string,
    attemptId: string,
    stage: CriticalDeletionStage,
    errorCode: string,
  ) => Promise<void>;
  notifyAffectedParties: (userId: string) => Promise<void>;
  deleteOwnedListings: (userId: string) => Promise<void>;
  cancelSubscriptions: (userId: string) => Promise<void>;
  removeOwnedStorage: (userId: string) => Promise<void>;
  removeFiresalePhotos: (userId: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
  onBestEffortError?: (scope: string, error: unknown) => void;
  onLedgerError?: (scope: string, error: unknown) => void;
};

export class AccountDeletionFailure extends Error {
  constructor(
    public readonly stage: DeletionJobStage,
    public readonly errorCode: string,
    public readonly originalError: unknown,
  ) {
    super(errorCode);
    this.name = "AccountDeletionFailure";
  }
}

const CRITICAL_STAGES: ReadonlyArray<{
  stage: CriticalDeletionStage;
  errorCode: string;
  operation: keyof Pick<
    AccountDeletionOperations,
    | "deleteOwnedListings"
    | "cancelSubscriptions"
    | "removeOwnedStorage"
    | "removeFiresalePhotos"
    | "deleteAuthUser"
  >;
}> = [
  { stage: "listings", errorCode: "listings_cleanup_failed", operation: "deleteOwnedListings" },
  { stage: "subscriptions", errorCode: "subscriptions_cleanup_failed", operation: "cancelSubscriptions" },
  { stage: "storage", errorCode: "storage_cleanup_failed", operation: "removeOwnedStorage" },
  { stage: "firesale_photos", errorCode: "firesale_photos_cleanup_failed", operation: "removeFiresalePhotos" },
  { stage: "auth", errorCode: "auth_deletion_failed", operation: "deleteAuthUser" },
];

async function recordDeletionFailure(
  operations: AccountDeletionOperations,
  userId: string,
  attemptId: string,
  stage: CriticalDeletionStage,
  errorCode: string,
): Promise<void> {
  try {
    await operations.markFailed(userId, attemptId, stage, errorCode);
  } catch (ledgerError: unknown) {
    operations.onLedgerError?.("mark_failed", ledgerError);
  }
}

export async function runAccountDeletion(
  userId: string,
  operations: AccountDeletionOperations,
): Promise<void> {
  let attemptId: string;
  try {
    attemptId = await operations.beginAttempt(userId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = message.includes("account_deletion_already_in_progress")
      ? "account_deletion_already_in_progress"
      : "job_initialization_failed";
    throw new AccountDeletionFailure("requested", errorCode, error);
  }

  try {
    await operations.notifyAffectedParties(userId);
  } catch (error: unknown) {
    operations.onBestEffortError?.("notifications", error);
  }

  for (const { stage, errorCode, operation } of CRITICAL_STAGES) {
    try {
      await operations.persistStage(userId, attemptId, stage);
    } catch (error: unknown) {
      await recordDeletionFailure(
        operations,
        userId,
        attemptId,
        stage,
        "job_stage_persistence_failed",
      );
      throw new AccountDeletionFailure(stage, "job_stage_persistence_failed", error);
    }

    try {
      await operations[operation](userId);
    } catch (error: unknown) {
      await recordDeletionFailure(operations, userId, attemptId, stage, errorCode);
      throw new AccountDeletionFailure(stage, errorCode, error);
    }
  }
}

export function deletionFailureResponse(
  stage: DeletionJobStage,
  errorCode: string,
  corsHeaders: Record<string, string>,
): Response {
  const alreadyRunning = errorCode === "account_deletion_already_in_progress";
  return new Response(JSON.stringify({
    error: alreadyRunning ? "account_deletion_already_in_progress" : "account_deletion_incomplete",
    message: alreadyRunning
      ? "Account deletion is already in progress."
      : "Account deletion was not completed. Retry the request while signed in.",
    stage,
    retryable: !alreadyRunning,
  }), {
    status: alreadyRunning ? 409 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type MutationClient = {
  from: (table: string) => {
    delete: () => {
      eq: (column: string, value: unknown) => PromiseLike<{ error: DbError }>;
    };
  };
};

export async function deleteOwnedListings(
  supabase: MutationClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("listings")
    .delete()
    .eq("owner_id", userId);
  if (error) {
    throw new Error(`listings_cleanup_failed: ${error.message ?? error.code ?? "unknown"}`);
  }
}

type StripeSubscriptionPage = {
  data: Array<{ id: string }>;
  has_more?: boolean;
};

type StripeCleanupClient = {
  customers: {
    search: (params: {
      query: string;
      limit: number;
      page?: string;
    }) => PromiseLike<{
      data: Array<{ id: string }>;
      has_more?: boolean;
      next_page?: string | null;
    }>;
  };
  subscriptions: {
    list: (params: {
      customer: string;
      status: "active" | "trialing";
      limit: number;
      starting_after?: string;
    }) => PromiseLike<StripeSubscriptionPage>;
    cancel: (subscriptionId: string) => PromiseLike<unknown>;
  };
};

async function listSubscriptionsByStatus(
  stripe: StripeCleanupClient,
  customerId: string,
  status: "active" | "trialing",
): Promise<string[]> {
  const subscriptionIds: string[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    subscriptionIds.push(...page.data.map((subscription) => subscription.id));

    hasMore = page.has_more === true;
    if (!hasMore) continue;
    const lastId = page.data.at(-1)?.id;
    if (!lastId) throw new Error("subscription_list_pagination_failed");
    startingAfter = lastId;
  }

  return subscriptionIds;
}

export async function cancelActiveAndTrialingSubscriptions(
  stripe: StripeCleanupClient,
  customerIds: string[],
): Promise<void> {
  const subscriptionIds = new Set<string>();
  for (const customerId of customerIds) {
    for (const status of ["active", "trialing"] as const) {
      const ids = await listSubscriptionsByStatus(stripe, customerId, status);
      for (const id of ids) subscriptionIds.add(id);
    }
  }

  const cancellations = await Promise.allSettled(
    [...subscriptionIds].map((subscriptionId) =>
      Promise.resolve(stripe.subscriptions.cancel(subscriptionId))
    ),
  );
  const failureCount = cancellations.filter((result) => result.status === "rejected").length;
  if (failureCount > 0) {
    throw new Error(`subscription_cancellation_failed: ${failureCount}`);
  }
}

type BillingCustomerClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => PromiseLike<QueryResult<{ stripe_customer_id: string | null }>>;
    };
  };
};

async function findStripeCustomerIds(
  supabase: BillingCustomerClient,
  stripe: StripeCleanupClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`billing_customer_lookup_failed: ${error.message ?? error.code ?? "unknown"}`);
  }

  const customerIds = new Set(
    (data ?? [])
      .map((row) => row.stripe_customer_id)
      .filter((customerId): customerId is string => Boolean(customerId)),
  );

  let page: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const search = await stripe.customers.search({
      query: `metadata['user_id']:'${userId}'`,
      limit: 100,
      ...(page ? { page } : {}),
    });
    for (const customer of search.data) customerIds.add(customer.id);
    hasMore = search.has_more === true;
    if (!hasMore) continue;
    if (!search.next_page) throw new Error("stripe_customer_search_pagination_failed");
    page = search.next_page;
  }

  return [...customerIds];
}

async function cancelUserSubscriptions(
  supabase: BillingCustomerClient,
  stripe: StripeCleanupClient,
  userId: string,
): Promise<void> {
  const customerIds = await findStripeCustomerIds(supabase, stripe, userId);
  await cancelActiveAndTrialingSubscriptions(stripe, customerIds);
}

type JobLedgerClient = {
  rpc: (
    functionName: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data?: unknown; error: DbError }>;
};

async function beginDeletionAttempt(
  supabase: JobLedgerClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("begin_account_deletion_job", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(error.message ?? error.code ?? "job_initialization_failed");
  }
  if (typeof data !== "string" || !data) throw new Error("job_initialization_failed: missing attempt id");
  return data;
}

async function persistDeletionStage(
  supabase: JobLedgerClient,
  userId: string,
  attemptId: string,
  stage: CriticalDeletionStage,
): Promise<void> {
  const { error } = await supabase.rpc("set_account_deletion_job_stage", {
    p_user_id: userId,
    p_attempt_id: attemptId,
    p_stage: stage,
    p_status: "in_progress",
    p_last_error: null,
  });
  if (error) throw new Error(`job_persistence_failed: ${error.message ?? error.code ?? "unknown"}`);
}

async function markDeletionFailed(
  supabase: JobLedgerClient,
  userId: string,
  attemptId: string,
  stage: CriticalDeletionStage,
  errorCode: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_account_deletion_job_stage", {
    p_user_id: userId,
    p_attempt_id: attemptId,
    p_stage: stage,
    p_status: "failed",
    p_last_error: errorCode,
  });
  if (error) throw new Error(`job_persistence_failed: ${error.message ?? error.code ?? "unknown"}`);
}

export async function removeOwnedStorage(
  supabase: StorageSubset,
  userId: string,
): Promise<void> {
  for (const bucket of USER_FOLDER_BUCKETS) {
    await removeFolderRecursive(supabase, bucket, userId);
  }
}

type FiresaleCleanupClient = StorageSubset & {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => PromiseLike<QueryResult<{ id: string }>>;
    };
  };
};

export async function removeOwnedFiresalePhotos(
  supabase: FiresaleCleanupClient,
  userId: string,
): Promise<void> {
  const { data: requests, error } = await supabase
    .from("firesale_requests")
    .select("id")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`firesale_request_lookup_failed: ${error.message ?? error.code ?? "unknown"}`);
  }

  for (const request of requests ?? []) {
    await removeFolderRecursive(supabase, "firesale-photos", request.id);
  }
}

type AuthDeletionClient = {
  auth: {
    admin: {
      deleteUser: (userId: string) => PromiseLike<{ error: DbError }>;
    };
  };
};

async function deleteAuthUser(
  supabase: AuthDeletionClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw new Error(`auth_deletion_failed: ${error.message ?? error.code ?? "unknown"}`);
}

Deno.serve(async (req) => { // skipcq: JS-R1005 - Account deletion coordinates critical external cleanup in a strict order.
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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    let stripe: StripeCleanupClient | null = null;
    const jobLedger = supabase as unknown as JobLedgerClient;

    await runAccountDeletion(user.id, {
      beginAttempt: (userId) => beginDeletionAttempt(jobLedger, userId),
      persistStage: (userId, attemptId, stage) => persistDeletionStage(jobLedger, userId, attemptId, stage),
      markFailed: (userId, attemptId, stage, errorCode) =>
        markDeletionFailed(jobLedger, userId, attemptId, stage, errorCode),
      notifyAffectedParties: (userId) =>
        notifyAccountDeletionAffectedParties(
          supabase as unknown as DeletionNotificationClient,
          userId,
        ),
      deleteOwnedListings: (userId) =>
        deleteOwnedListings(supabase as unknown as MutationClient, userId),
      cancelSubscriptions: async (userId) => {
        if (!stripeKey) throw new Error("stripe_configuration_missing");
        stripe ??= createStripeClient(stripeKey) as unknown as StripeCleanupClient;
        await cancelUserSubscriptions(
          supabase as unknown as BillingCustomerClient,
          stripe,
          userId,
        );
      },
      removeOwnedStorage: (userId) =>
        removeOwnedStorage(supabase as unknown as StorageSubset, userId),
      removeFiresalePhotos: (userId) =>
        removeOwnedFiresalePhotos(supabase as unknown as FiresaleCleanupClient, userId),
      deleteAuthUser: (userId) =>
        deleteAuthUser(supabase as unknown as AuthDeletionClient, userId),
      onBestEffortError: (_scope, error) => {
        log.warn("account deletion notification prep failed", {
          user_id: user.id,
          err: error instanceof Error ? error.message : String(error),
        });
      },
      onLedgerError: (scope, error) => {
        log.error("account deletion ledger write failed", {
          user_id: user.id,
          scope,
          err: error instanceof Error ? error.message : String(error),
        });
      },
    });

    log.info("user deleted", { user_id: user.id });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof AccountDeletionFailure) {
      log.error("critical account deletion stage failed", {
        stage: err.stage,
        error_code: err.errorCode,
        err: err.originalError instanceof Error
          ? err.originalError.message
          : String(err.originalError),
      });
      return deletionFailureResponse(err.stage, err.errorCode, corsHeaders);
    }

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
        options?: { limit?: number; offset?: number },
      ) => Promise<{ data: Array<{ id: string | null; name: string }> | null; error: unknown }>;
      remove: (
        paths: string[],
      ) => Promise<{ data?: unknown; error: unknown }>;
    };
  };
};

function storageErrorDetails(error: unknown): { code: string; message: string } {
  if (!error || typeof error !== "object") {
    return { code: "", message: String(error) };
  }
  const value = error as { code?: unknown; message?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : "",
    message: typeof value.message === "string" ? value.message : String(error),
  };
}

function isMissingBucketError(error: unknown): boolean {
  const { code, message } = storageErrorDetails(error);
  return code === "NoSuchBucket" ||
    /(?:specified )?bucket (?:does not exist|not found)/i.test(message);
}

export async function removeFolderRecursive( // skipcq: JS-R1005 - Recursive storage cleanup handles pagination, nested prefixes, and partial deletion errors.
  supabase: StorageSubset,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<void> {
  if (depth > 16) throw new Error(`storage_depth_limit_exceeded: ${bucket}`);

  type Entry = { id: string | null; name: string };
  const list: Entry[] = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data: entries, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset });
    if (error) {
      if (isMissingBucketError(error)) return;
      const { code, message } = storageErrorDetails(error);
      throw new Error(`storage_list_failed: ${bucket}: ${code || message || "unknown"}`);
    }

    const page = entries ?? [];
    list.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }

  if (list.length === 0) return;

  // Files have a non-null id; folders return id=null.
  const files = list.filter((e: Entry) => e.id !== null).map((e: Entry) => `${prefix}/${e.name}`);
  for (let index = 0; index < files.length; index += pageSize) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(files.slice(index, index + pageSize));
    if (error) {
      const { code, message } = storageErrorDetails(error);
      throw new Error(`storage_remove_failed: ${bucket}: ${code || message || "unknown"}`);
    }
  }

  const folders = list.filter((e: Entry) => e.id === null);
  for (const f of folders) {
    await removeFolderRecursive(supabase, bucket, `${prefix}/${f.name}`, depth + 1);
  }
}
