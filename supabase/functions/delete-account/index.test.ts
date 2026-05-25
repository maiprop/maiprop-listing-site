/**
 * Tests for delete-account edge function.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const moduleUrl = new URL("./index.ts", import.meta.url).href;
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
const {
  USER_FOLDER_BUCKETS,
  dedupeDeletionNotifications,
  insertDeletionNotifications,
  notifyAccountDeletionAffectedParties,
  removeFolderRecursive,
} = await import(moduleUrl);

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
  ]);
  assertEquals(USER_FOLDER_BUCKETS.includes("firesale-photos" as never), false);
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

Deno.test("storage cleanup includes open-house proof documents under the user folder", async () => {
  assert(USER_FOLDER_BUCKETS.includes("open-house-docs"));

  const listed: Array<{ bucket: string; prefix: string }> = [];
  const removed: Array<{ bucket: string; paths: string[] }> = [];

  const supabase = {
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string) => {
          listed.push({ bucket, prefix });
          if (bucket !== "open-house-docs") {
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

  await removeFolderRecursive(supabase, "open-house-docs", "user-1");

  assertEquals(listed, [
    { bucket: "open-house-docs", prefix: "user-1" },
    { bucket: "open-house-docs", prefix: "user-1/firesale" },
    { bucket: "open-house-docs", prefix: "user-1/firesale/deal-1" },
  ]);
  assertEquals(removed, [
    {
      bucket: "open-house-docs",
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

restore();
