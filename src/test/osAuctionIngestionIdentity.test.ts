import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const fullSync = read("supabase/functions/full-sync-from-os/index.ts");
const poll = read("supabase/functions/poll-os-auctions/index.ts");
const publicMapper = read("supabase/functions/fetch-os-auctions/auctionMapping.ts");
const publicProxy = read("supabase/functions/fetch-os-auctions/index.ts");

describe("OS auction ingestion identity", () => {
  it.each([fullSync, poll])("deduplicates batches and ignores insert races without merge-updating listings", (source) => {
    expect(source).toContain("dedupeOsAuctionsById");
    expect(source).toContain("requireOsAuctionId");
    expect(source).toContain("insertOsAuctionRows(");
    expect(source).not.toContain('auctionListingId ?? "unknown"');
  });

  it.each([fullSync, poll])("uses the executable canonical lookup and mutation guards", (source) => {
    expect(source).toContain("lookupCanonicalOsListings(");
    expect(source).not.toContain('.overlaps("tags", osIds)');
    expect(source).toContain('tags: mergeOsAuctionTags(existing.tags ?? [], row.tags)');
    expect(source).toContain("updateCanonicalOsListing(");
  });

  it.each([fullSync, poll])("reports only rows actually inserted after conflict races", (source) => {
    expect(source).toMatch(/\b(?:totalImported|imported) \+= await insertOsAuctionRows\(/);
  });

  it("keeps poll pool maintenance inside the canonical unowned OS boundary", () => {
    const poolMutation = poll.match(
      /async function removeDailyPoolTagFromRows[\s\S]*?(?=async function fetchActiveDailyPoolRows)/,
    )?.[0];
    expect(poolMutation).toBeDefined();
    expect(poolMutation).toContain("updateCanonicalOsListing(");
    expect(poolMutation).toContain("requiredTags: [poolTag]");
    expect(poolMutation).toContain('throw new Error("canonical_os_pool_listing_changed")');
  });

  it("rejects a nonempty poll batch with no valid identities before pruning", () => {
    const validation = poll.indexOf(
      "requireValidOsAuctionBatch(auctions.length, validAuctions.length)",
    );
    const pruning = poll.indexOf("pruneUnselectedDailyPoolRows(", validation);
    expect(validation).toBeGreaterThan(-1);
    expect(pruning).toBeGreaterThan(validation);
  });

  it("drops malformed upstream identities from the read-through proxy", () => {
    expect(publicProxy).toContain("dedupeOsAuctionsById(osResult.auctions)");
    expect(publicMapper).toContain("requireOsAuctionId(auction.auctionListingId)");
    expect(publicMapper).not.toContain('auctionListingId ?? "unknown"');
  });
});
