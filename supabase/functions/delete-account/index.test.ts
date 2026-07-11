/**
 * Tests for delete-account edge function.
 */
import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const moduleUrl = new URL("./index.ts", import.meta.url).href;
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
const {
  USER_FOLDER_BUCKETS,
  cancelActiveAndTrialingSubscriptions,
  dedupeDeletionNotifications,
  deletionFailureResponse,
  deleteOwnedListings,
  insertDeletionNotifications,
  notifyAccountDeletionAffectedParties,
  removeFolderRecursive,
  removeOwnedFiresalePhotos,
  runAccountDeletion,
} = await import(moduleUrl);

type DeletionStage = "listings" | "subscriptions" | "storage" | "firesale_photos" | "auth";

function asDeletionFailure(error: unknown): Error & { stage: string; errorCode: string } {
  assert(error instanceof Error);
  return error as Error & { stage: string; errorCode: string };
}

function makeDeletionOperations(failures: Partial<Record<DeletionStage, number>> = {}) {
  const calls: string[] = [];
  const failedJobs: Array<{ stage: string; errorCode: string }> = [];
  const remainingFailures = { ...failures };
  const critical = (stage: DeletionStage) => () => {
    calls.push(`run:${stage}`);
    if ((remainingFailures[stage] ?? 0) > 0) {
      remainingFailures[stage] = (remainingFailures[stage] ?? 0) - 1;
      return Promise.reject(new Error(`${stage} unavailable`));
    }
    return Promise.resolve();
  };

  return {
    calls,
    failedJobs,
    operations: {
      beginAttempt: () => {
        calls.push("begin");
        return Promise.resolve("attempt-1");
      },
      persistStage: (_userId: string, attemptId: string, stage: DeletionStage) => {
        assertEquals(attemptId, "attempt-1");
        calls.push(`stage:${stage}`);
        return Promise.resolve();
      },
      markFailed: (_userId: string, attemptId: string, stage: string, errorCode: string) => {
        assertEquals(attemptId, "attempt-1");
        calls.push(`failed:${stage}`);
        failedJobs.push({ stage, errorCode });
        return Promise.resolve();
      },
      notifyAffectedParties: () => {
        calls.push("notify");
        return Promise.resolve();
      },
      deleteOwnedListings: critical("listings"),
      cancelSubscriptions: critical("subscriptions"),
      removeOwnedStorage: critical("storage"),
      removeFiresalePhotos: critical("firesale_photos"),
      deleteAuthUser: critical("auth"),
    },
  };
}

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
});

Deno.test("authenticated destructive endpoint rejects non-POST before auth lookup", async () => {
  const res = await handler(authedReq("GET"));
  assertEquals(res.status, 405);
});

Deno.test("fake Bearer token returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST"));
  assertEquals([401, 503].includes(res.status), true);
});

Deno.test("user-folder cleanup bucket allowlist covers only user-id-prefixed storage", () => {
  assertEquals(USER_FOLDER_BUCKETS, [
    "listing-images",
    "avatars",
    "project-media",
    "message-attachments",
    "open-house-docs",
    "firesale-proof-docs",
  ]);
  assertEquals(USER_FOLDER_BUCKETS.includes("firesale-photos" as never), false);
});

Deno.test("listing cleanup failure is persisted and blocks every later critical stage", async () => {
  const fixture = makeDeletionOperations({ listings: 1 });

  const error = asDeletionFailure(await assertRejects(
    () => runAccountDeletion("user-1", fixture.operations),
  ));

  assertEquals(error.stage, "listings");
  assertEquals(error.errorCode, "listings_cleanup_failed");
  assertEquals(fixture.calls, [
    "begin",
    "notify",
    "stage:listings",
    "run:listings",
    "failed:listings",
  ]);
  assertEquals(fixture.failedJobs, [{
    stage: "listings",
    errorCode: "listings_cleanup_failed",
  }]);
});

Deno.test("Stripe cleanup failure is persisted and blocks storage and Auth deletion", async () => {
  const fixture = makeDeletionOperations({ subscriptions: 1 });

  const error = asDeletionFailure(await assertRejects(
    () => runAccountDeletion("user-2", fixture.operations),
  ));

  assertEquals(error.stage, "subscriptions");
  assertEquals(error.errorCode, "subscriptions_cleanup_failed");
  assertEquals(fixture.calls.includes("run:storage"), false);
  assertEquals(fixture.calls.includes("run:auth"), false);
  assertEquals(fixture.failedJobs, [{
    stage: "subscriptions",
    errorCode: "subscriptions_cleanup_failed",
  }]);
});

Deno.test("owned storage cleanup failure is persisted and blocks firesale and Auth deletion", async () => {
  const fixture = makeDeletionOperations({ storage: 1 });

  const error = asDeletionFailure(await assertRejects(
    () => runAccountDeletion("user-3", fixture.operations),
  ));

  assertEquals(error.stage, "storage");
  assertEquals(fixture.calls.includes("run:firesale_photos"), false);
  assertEquals(fixture.calls.includes("run:auth"), false);
  assertEquals(fixture.failedJobs, [{
    stage: "storage",
    errorCode: "storage_cleanup_failed",
  }]);
});

Deno.test("firesale photo cleanup failure is persisted and blocks Auth deletion", async () => {
  const fixture = makeDeletionOperations({ firesale_photos: 1 });

  const error = asDeletionFailure(await assertRejects(
    () => runAccountDeletion("user-4", fixture.operations),
  ));

  assertEquals(error.stage, "firesale_photos");
  assertEquals(fixture.calls.includes("run:auth"), false);
  assertEquals(fixture.failedJobs, [{
    stage: "firesale_photos",
    errorCode: "firesale_photos_cleanup_failed",
  }]);
});

Deno.test("successful deletion persists every stage before work and completes after Auth deletion", async () => {
  const fixture = makeDeletionOperations();

  await runAccountDeletion("user-5", fixture.operations);

  assertEquals(fixture.calls, [
    "begin",
    "notify",
    "stage:listings",
    "run:listings",
    "stage:subscriptions",
    "run:subscriptions",
    "stage:storage",
    "run:storage",
    "stage:firesale_photos",
    "run:firesale_photos",
    "stage:auth",
    "run:auth",
  ]);
});

Deno.test("a failed attempt can retry from the beginning and rerun critical cleanup safely", async () => {
  const fixture = makeDeletionOperations({ storage: 1 });

  await assertRejects(
    () => runAccountDeletion("user-6", fixture.operations),
  );
  await runAccountDeletion("user-6", fixture.operations);

  assertEquals(fixture.calls.filter((call) => call === "begin").length, 2);
  assertEquals(fixture.calls.filter((call) => call === "run:listings").length, 2);
  assertEquals(fixture.calls.filter((call) => call === "run:subscriptions").length, 2);
  assertEquals(fixture.calls.filter((call) => call === "run:storage").length, 2);
  assertEquals(fixture.calls.filter((call) => call === "run:auth").length, 1);
});

Deno.test("critical deletion failures return a useful retryable non-2xx response", async () => {
  const response = deletionFailureResponse(
    "storage",
    "storage_cleanup_failed",
    { "Access-Control-Allow-Origin": "https://maiprop.co" },
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "account_deletion_incomplete",
    message: "Account deletion was not completed. Retry the request while signed in.",
    stage: "storage",
    retryable: true,
  });
});

Deno.test("concurrent deletion attempts return a non-retryable conflict", async () => {
  const response = deletionFailureResponse(
    "requested",
    "account_deletion_already_in_progress",
    { "Access-Control-Allow-Origin": "https://maiprop.co" },
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: "account_deletion_already_in_progress",
    message: "Account deletion is already in progress.",
    stage: "requested",
    retryable: false,
  });
});

Deno.test("subscription cancellation waits for every request and rejects individual failures", async () => {
  const cancelled: string[] = [];
  const stripe = {
    subscriptions: {
      list: ({ status }: { status: string }) => Promise.resolve({
        data: status === "active"
          ? [{ id: "sub-active-ok" }, { id: "sub-active-fails" }]
          : [{ id: "sub-trial" }],
        has_more: false,
      }),
      cancel: (subscriptionId: string) => {
        cancelled.push(subscriptionId);
        return subscriptionId === "sub-active-fails"
          ? Promise.reject(new Error("Stripe cancellation failed"))
          : Promise.resolve({ id: subscriptionId });
      },
    },
  };

  await assertRejects(
    () => cancelActiveAndTrialingSubscriptions(stripe, ["cus-1"]),
    Error,
    "subscription_cancellation_failed",
  );
  assertEquals(cancelled.sort(), ["sub-active-fails", "sub-active-ok", "sub-trial"]);
});

Deno.test("owned listing deletion propagates database errors", async () => {
  const supabase = {
    from: () => ({
      delete: () => ({
        eq: () => Promise.resolve({
          error: { code: "XX000", message: "database unavailable" },
        }),
      }),
    }),
  };

  await assertRejects(
    () => deleteOwnedListings(supabase, "user-7"),
    Error,
    "listings_cleanup_failed",
  );
});

Deno.test("firesale photo cleanup propagates request lookup errors", async () => {
  const supabase = {
    from: () => ({
      select() {
        return this;
      },
      eq: () => Promise.resolve({
        data: null,
        error: { code: "XX000", message: "database unavailable" },
      }),
    }),
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ data: [], error: null }),
      }),
    },
  };

  await assertRejects(
    () => removeOwnedFiresalePhotos(supabase, "user-8"),
    Error,
    "firesale_request_lookup_failed",
  );
});

Deno.test("account deletion notifications cover affected listing parties and conversations", async () => {
  const inserted: Array<Array<Record<string, unknown>>> = [];
  const rowsByTable: Record<string, unknown[]> = {
    listings: [{ id: "listing-1", title: "Sea View House" }],
    favorites: [{ user_id: "saved-user", listing_id: "listing-1" }],
    viewings: [{ requester_id: "viewer-user", listing_id: "listing-1" }],
    open_house_registrations: [{ requester_id: "registrant-user", listing_id: "listing-1" }],
    open_house_offers: [{ bidder_id: "bidder-user", listing_id: "listing-1" }],
    conversations: [{ participant_a: "owner-user", participant_b: "chat-user" }],
  };
  const supabase = {
    from: (table: string) => ({
      select() {
        return this;
      },
      eq() {
        return Promise.resolve({ data: rowsByTable[table] ?? [], error: null });
      },
      in() {
        return Promise.resolve({ data: rowsByTable[table] ?? [], error: null });
      },
      or() {
        return Promise.resolve({ data: rowsByTable[table] ?? [], error: null });
      },
      insert(rows: Array<Record<string, unknown>>) {
        inserted.push(rows);
        return Promise.resolve({ error: null });
      },
    }),
  };

  await notifyAccountDeletionAffectedParties(supabase as never, "owner-user");

  const notifications = inserted.flat();
  assertEquals(notifications.map((row) => row.user_id).sort(), [
    "bidder-user",
    "chat-user",
    "registrant-user",
    "saved-user",
    "viewer-user",
  ]);
  assert(notifications.every((row) => row.user_id !== "owner-user"));
  assert(notifications.every((row) => !String(row.body).includes("Sea View House")));
  assert(notifications.some((row) => row.title === "Saved listing removed"));
  assert(notifications.some((row) => row.title === "Conversation closed"));
});

Deno.test("notification inserts dedupe rows and fall back when link column is missing", async () => {
  const inserted: Array<Array<Record<string, unknown>>> = [];
  let calls = 0;
  const supabase = {
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return Promise.resolve({ data: [], error: null });
      },
      in() {
        return Promise.resolve({ data: [], error: null });
      },
      or() {
        return Promise.resolve({ data: [], error: null });
      },
      insert(rows: Array<Record<string, unknown>>) {
        calls += 1;
        inserted.push(rows);
        return Promise.resolve({
          error: calls === 1 ? { code: "42703", message: "column link does not exist" } : null,
        });
      },
    }),
  };
  const notifications = dedupeDeletionNotifications([
    { user_id: "u-1", title: "T", body: "B", type: "message", link: "/messages" },
    { user_id: "u-1", title: "T", body: "B", type: "message", link: "/messages" },
  ]);

  assertEquals(notifications.length, 1);
  await insertDeletionNotifications(supabase as never, notifications);

  assertEquals(inserted.length, 2);
  assertEquals(inserted[1][0].link, undefined);
});

Deno.test("storage cleanup includes firesale proof documents under the user folder", async () => {
  assert(USER_FOLDER_BUCKETS.includes("open-house-docs"));
  assert(USER_FOLDER_BUCKETS.includes("firesale-proof-docs"));

  const listed: Array<{ bucket: string; prefix: string }> = [];
  const removed: Array<{ bucket: string; paths: string[] }> = [];

  const supabase = {
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string) => {
          listed.push({ bucket, prefix });
          if (bucket !== "firesale-proof-docs") {
            return Promise.resolve({ data: [], error: null });
          }
          if (prefix === "user-1") {
            return Promise.resolve({
              data: [{ id: null, name: "firesale" }],
              error: null,
            });
          }
          if (prefix === "user-1/firesale") {
            return Promise.resolve({
              data: [{ id: null, name: "deal-1" }],
              error: null,
            });
          }
          if (prefix === "user-1/firesale/deal-1") {
            return Promise.resolve({
              data: [{ id: "file-1", name: "proof.pdf" }],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
        remove: (paths: string[]) => {
          removed.push({ bucket, paths });
          return Promise.resolve({ error: null });
        },
      }),
    },
  };

  await removeFolderRecursive(supabase, "firesale-proof-docs", "user-1");

  assertEquals(listed, [
    { bucket: "firesale-proof-docs", prefix: "user-1" },
    { bucket: "firesale-proof-docs", prefix: "user-1/firesale" },
    { bucket: "firesale-proof-docs", prefix: "user-1/firesale/deal-1" },
  ]);
  assertEquals(removed, [
    {
      bucket: "firesale-proof-docs",
      paths: ["user-1/firesale/deal-1/proof.pdf"],
    },
  ]);
});

Deno.test("recursive storage cleanup removes nested project and message files without deleting sibling prefixes", async () => {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const entriesByPrefix = new Map<string, Array<{ id: string | null; name: string }>>([
    ["user-2", [{ id: null, name: "child-a" }, { id: "root-file", name: "avatar.png" }]],
    ["user-2/child-a", [{ id: null, name: "child-b" }, { id: "nested-file", name: "floorplan.pdf" }]],
    ["user-2/child-a/child-b", [{ id: "deep-file", name: "contract.pdf" }]],
  ]);

  const supabase = {
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string) => Promise.resolve({
          data: entriesByPrefix.get(prefix) ?? [],
          error: null,
        }),
        remove: (paths: string[]) => {
          removed.push({ bucket, paths });
          return Promise.resolve({ error: null });
        },
      }),
    },
  };

  await removeFolderRecursive(supabase, "project-media", "user-2");

  assertEquals(removed, [
    { bucket: "project-media", paths: ["user-2/avatar.png"] },
    { bucket: "project-media", paths: ["user-2/child-a/floorplan.pdf"] },
    { bucket: "project-media", paths: ["user-2/child-a/child-b/contract.pdf"] },
  ]);
});

Deno.test("recursive storage cleanup treats an absent optional bucket as no data", async () => {
  let removeCalled = false;
  const supabase = {
    storage: {
      from: () => ({
        list: () => Promise.resolve({
          data: null,
          error: { code: "NoSuchBucket", message: "The specified bucket does not exist" },
        }),
        remove: () => {
          removeCalled = true;
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  };

  await removeFolderRecursive(supabase, "optional-bucket", "user-9");

  assertEquals(removeCalled, false);
});

Deno.test("recursive storage cleanup propagates actual list errors", async () => {
  const supabase = {
    storage: {
      from: () => ({
        list: () => Promise.resolve({
          data: null,
          error: { code: "DatabaseError", message: "storage database unavailable" },
        }),
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
  };

  await assertRejects(
    () => removeFolderRecursive(supabase, "listing-images", "user-10"),
    Error,
    "storage_list_failed",
  );
});

Deno.test("recursive storage cleanup propagates remove errors", async () => {
  const supabase = {
    storage: {
      from: () => ({
        list: () => Promise.resolve({
          data: [{ id: "file-1", name: "owned.jpg" }],
          error: null,
        }),
        remove: () => Promise.resolve({
          data: null,
          error: { code: "DatabaseError", message: "remove unavailable" },
        }),
      }),
    },
  };

  await assertRejects(
    () => removeFolderRecursive(supabase, "listing-images", "user-11"),
    Error,
    "storage_remove_failed",
  );
});

restore();
