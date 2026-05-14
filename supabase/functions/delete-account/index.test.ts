/**
 * Tests for delete-account edge function.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const moduleUrl = new URL("./index.ts", import.meta.url).href;
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
const { USER_FOLDER_BUCKETS, removeFolderRecursive } = await import(moduleUrl);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer token returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST"));
  assertEquals([401, 503].includes(res.status), true);
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

restore();
