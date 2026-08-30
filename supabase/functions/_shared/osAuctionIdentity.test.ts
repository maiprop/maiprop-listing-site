import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dedupeByOsAuctionTag,
  dedupeOsAuctionsById,
  normalizeOsAuctionId,
  requireOsAuctionId,
} from "./osAuctionIdentity.ts";
import * as identityModule from "./osAuctionIdentity.ts";

type FakeListing = Record<string, unknown> & {
  id: string;
  listing_type: string;
  os_auction_id: string | null;
  owner_id: string | null;
  tags: string[];
};

function createFakeListingTable(
  initialRows: FakeListing[],
  options: {
    lookupError?: { message: string };
    insertedRows?: Array<{ id: string }>;
  } = {},
) {
  const rows = structuredClone(initialRows);
  let lastUpsertOptions: Record<string, unknown> | null = null;

  const buildQuery = (
    operation: "select" | "update" | "upsert",
    values?: Record<string, unknown> | readonly Record<string, unknown>[],
  ) => {
    const filters: Array<(row: FakeListing) => boolean> = [];
    const query = {
      in(column: string, allowed: readonly unknown[]) {
        filters.push((row) => allowed.includes(row[column]));
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return query;
      },
      is(column: string, value: null) {
        filters.push((row) => row[column] === value);
        return query;
      },
      contains(column: string, required: readonly unknown[]) {
        filters.push((row) => {
          const actual = row[column];
          return Array.isArray(actual) &&
            required.every((value) => actual.includes(value));
        });
        return query;
      },
      select(_columns: string) {
        return query;
      },
      then<TResult1 = unknown, TResult2 = never>(
        resolve?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        const matched = rows.filter((row) =>
          filters.every((filter) => filter(row))
        );
        let result: unknown;
        if (operation === "select") {
          result = options.lookupError
            ? { data: null, error: options.lookupError }
            : { data: matched, error: null };
        } else if (operation === "update") {
          for (const row of matched) Object.assign(row, values);
          result = { data: null, count: matched.length, error: null };
        } else {
          result = { data: options.insertedRows ?? [], error: null };
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  };

  return {
    rows,
    getLastUpsertOptions: () => lastUpsertOptions,
    table: {
      select: (_columns: string) => buildQuery("select"),
      update: (values: Record<string, unknown>) => buildQuery("update", values),
      upsert: (
        values: readonly Record<string, unknown>[],
        upsertOptions: Record<string, unknown>,
      ) => {
        lastUpsertOptions = upsertOptions;
        return buildQuery("upsert", values);
      },
    },
  };
}

const databaseHelpers = identityModule as unknown as {
  requireValidOsAuctionBatch?: (rawCount: number, validCount: number) => void;
  lookupCanonicalOsListings?: (
    table: unknown,
    osIds: readonly string[],
  ) => Promise<FakeListing[]>;
  updateCanonicalOsListing?: (
    table: unknown,
    input: {
      id: string;
      osId: string;
      data: Record<string, unknown>;
      requiredTags?: readonly string[];
    },
  ) => Promise<boolean>;
  insertOsAuctionRows?: (
    table: unknown,
    rows: readonly Record<string, unknown>[],
  ) => Promise<number>;
};

Deno.test("OS auction identities normalize case and whitespace", () => {
  assertEquals(normalizeOsAuctionId("  A0B1-C2D3  "), "a0b1-c2d3");
});

Deno.test("missing and placeholder OS auction identities are rejected", () => {
  for (const value of [undefined, null, ""]) {
    assertEquals(normalizeOsAuctionId(value), null);
    assertThrows(
      () => requireOsAuctionId(value),
      TypeError,
      "invalid_os_auction_id",
    );
  }
});

Deno.test("finite safe integer OS identities normalize to canonical strings", () => {
  assertEquals(normalizeOsAuctionId(0), "0");
  assertEquals(normalizeOsAuctionId(42), "42");
  assertEquals(
    normalizeOsAuctionId(Number.MAX_SAFE_INTEGER),
    String(Number.MAX_SAFE_INTEGER),
  );
});

Deno.test("non-integer and unsafe numeric OS identities are rejected", () => {
  for (
    const value of [
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]
  ) {
    assertEquals(normalizeOsAuctionId(value), null);
    assertThrows(
      () => requireOsAuctionId(value),
      TypeError,
      "invalid_os_auction_id",
    );
  }
});

Deno.test("TypeScript rejects every SQL placeholder OS auction identity", () => {
  for (const value of ["unknown", "null", "undefined", "none", "na", "n/a"]) {
    assertEquals(normalizeOsAuctionId(value), null);
    assertThrows(
      () => requireOsAuctionId(value),
      TypeError,
      "invalid_os_auction_id",
    );
  }
});

Deno.test("same-page duplicate OS identities collapse to one last-write row", () => {
  assertEquals(
    dedupeByOsAuctionTag([
      { tagKey: "os_auction:a", round: 1 },
      { tagKey: "os_auction:b", round: 1 },
      { tagKey: "os_auction:a", round: 2 },
    ]),
    [
      { tagKey: "os_auction:a", round: 2 },
      { tagKey: "os_auction:b", round: 1 },
    ],
  );
});

Deno.test("same identity with multiple rounds keeps the highest provider round", () => {
  assertEquals(
    dedupeOsAuctionsById([
      { auctionListingId: " A ", currentRound: 3 },
      { auctionListingId: "a", currentRound: 1 },
      { auctionListingId: "b", currentRound: 2 },
    ]),
    [
      { auctionListingId: " A ", currentRound: 3 },
      { auctionListingId: "b", currentRound: 2 },
    ],
  );
});

Deno.test("same-round duplicates choose the same canonical row regardless of input order", () => {
  const alpha = {
    auctionListingId: "auction-a",
    currentRound: 2,
    title: "Alpha",
  };
  const omega = {
    auctionListingId: "auction-a",
    currentRound: 2,
    title: "Omega",
  };

  assertEquals(dedupeOsAuctionsById([alpha, omega]), [omega]);
  assertEquals(dedupeOsAuctionsById([omega, alpha]), [omega]);
});

Deno.test("deterministic tie-break escapes structured provider values", () => {
  const combined = {
    auctionListingId: "auction-a",
    currentRound: 2,
    parts: ["a,string:b"],
  };
  const split = {
    auctionListingId: "auction-a",
    currentRound: 2,
    parts: ["a", "b"],
  };

  assertEquals(dedupeOsAuctionsById([combined, split]), [combined]);
  assertEquals(dedupeOsAuctionsById([split, combined]), [combined]);
});

Deno.test("managed OS tag refresh preserves manual and scheduler-owned tags", () => {
  const mergeOsAuctionTags = (
    identityModule as unknown as {
      mergeOsAuctionTags?: (
        existing: readonly string[],
        incoming: readonly string[],
      ) => string[];
    }
  ).mergeOsAuctionTags;
  assertEquals(typeof mergeOsAuctionTags, "function");
  if (!mergeOsAuctionTags) return;

  const existing = [
    "os_auction:42",
    "source:maiprop-os",
    "round:1",
    "auction_status:scheduled",
    "auction_pool:2026-08-29",
    "manual:keep",
  ];
  const fullSyncRefresh = mergeOsAuctionTags(existing, [
    "os_auction:42",
    "source:maiprop-os",
    "round:2",
    "auction_status:open",
  ]);
  assertEquals(fullSyncRefresh.toSorted(), [
    "auction_pool:2026-08-29",
    "auction_status:open",
    "manual:keep",
    "os_auction:42",
    "round:2",
    "source:maiprop-os",
  ]);

  const pollRefresh = mergeOsAuctionTags(fullSyncRefresh, [
    "os_auction:42",
    "source:maiprop-os",
    "round:2",
    "auction_status:open",
    "auction_pool:2026-08-30",
  ]);
  assertEquals(pollRefresh.toSorted(), [
    "auction_pool:2026-08-30",
    "auction_status:open",
    "manual:keep",
    "os_auction:42",
    "round:2",
    "source:maiprop-os",
  ]);
});

Deno.test("nonempty all-malformed OS batches fail before destructive follow-up work", () => {
  const requireValidOsAuctionBatch = databaseHelpers.requireValidOsAuctionBatch;
  assertEquals(typeof requireValidOsAuctionBatch, "function");
  if (!requireValidOsAuctionBatch) return;

  assertThrows(
    () => requireValidOsAuctionBatch(2, 0),
    TypeError,
    "no_valid_os_auction_identities",
  );
  requireValidOsAuctionBatch(2, 1);
  requireValidOsAuctionBatch(0, 0);
});

Deno.test("canonical lookup fails closed and excludes owned or non-source rows", async () => {
  const lookupCanonicalOsListings = databaseHelpers.lookupCanonicalOsListings;
  assertEquals(typeof lookupCanonicalOsListings, "function");
  if (!lookupCanonicalOsListings) return;

  const fixtures: FakeListing[] = [
    {
      id: "eligible",
      listing_type: "auction",
      os_auction_id: "a",
      owner_id: null,
      tags: ["source:maiprop-os", "os_auction:a"],
    },
    {
      id: "owned",
      listing_type: "auction",
      os_auction_id: "b",
      owner_id: "user-1",
      tags: ["source:maiprop-os", "os_auction:b"],
    },
    {
      id: "manual",
      listing_type: "auction",
      os_auction_id: "c",
      owner_id: null,
      tags: ["manual:keep", "os_auction:c"],
    },
  ];
  const fake = createFakeListingTable(fixtures);
  const rows = await lookupCanonicalOsListings(fake.table, ["a", "b", "c"]);
  assertEquals(rows.map((row) => row.id), ["eligible"]);

  const failing = createFakeListingTable([], {
    lookupError: { message: "lookup unavailable" },
  });
  await assertRejects(
    () => lookupCanonicalOsListings(failing.table, ["a"]),
    Error,
    "lookup unavailable",
  );
});

Deno.test("canonical update treats a zero affected count as a failed safe write", async () => {
  const updateCanonicalOsListing = databaseHelpers.updateCanonicalOsListing;
  assertEquals(typeof updateCanonicalOsListing, "function");
  if (!updateCanonicalOsListing) return;

  const fake = createFakeListingTable([{
    id: "owned",
    listing_type: "auction",
    os_auction_id: "a",
    owner_id: "user-1",
    status: "active",
    tags: ["source:maiprop-os", "os_auction:a"],
  }]);
  assertEquals(
    await updateCanonicalOsListing(fake.table, {
      id: "owned",
      osId: "a",
      data: { status: "paused" },
    }),
    false,
  );
  assertEquals(fake.rows[0].status, "active");
});

Deno.test("canonical pool-tag update requires the selected pool tag at mutation time", async () => {
  const updateCanonicalOsListing = databaseHelpers.updateCanonicalOsListing;
  assertEquals(typeof updateCanonicalOsListing, "function");
  if (!updateCanonicalOsListing) return;

  const fake = createFakeListingTable([
    {
      id: "selected",
      listing_type: "auction",
      os_auction_id: "a",
      owner_id: null,
      tags: ["source:maiprop-os", "os_auction:a", "auction_pool:today"],
    },
    {
      id: "changed",
      listing_type: "auction",
      os_auction_id: "b",
      owner_id: null,
      tags: ["source:maiprop-os", "os_auction:b"],
    },
  ]);
  assertEquals(
    await updateCanonicalOsListing(fake.table, {
      id: "selected",
      osId: "a",
      requiredTags: ["auction_pool:today"],
      data: { tags: ["source:maiprop-os", "os_auction:a"] },
    }),
    true,
  );
  assertEquals(
    await updateCanonicalOsListing(fake.table, {
      id: "changed",
      osId: "b",
      requiredTags: ["auction_pool:today"],
      data: { tags: ["source:maiprop-os", "os_auction:b"] },
    }),
    false,
  );
});

Deno.test("insert-only conflict fallback reports only returned inserts", async () => {
  const insertOsAuctionRows = databaseHelpers.insertOsAuctionRows;
  assertEquals(typeof insertOsAuctionRows, "function");
  if (!insertOsAuctionRows) return;

  const fake = createFakeListingTable([], {
    insertedRows: [{ id: "inserted" }],
  });
  assertEquals(
    await insertOsAuctionRows(fake.table, [{ id: "inserted" }, {
      id: "raced",
    }]),
    1,
  );
  assertEquals(fake.getLastUpsertOptions(), {
    onConflict: "os_auction_id",
    ignoreDuplicates: true,
  });
});
