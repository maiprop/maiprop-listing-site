import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707090000_guard_record_listing_view_public_visibility.sql"),
  "utf8",
);
const normalizedSql = migration.toLowerCase();

describe("record_listing_view visibility guard migration", () => {
  it("records analytics only for active public listings", () => {
    expect(normalizedSql).toContain("create or replace function public.record_listing_view");
    expect(normalizedSql).toContain("with visible_listing as");
    expect(migration).toContain("status = 'active'::public.listing_status");
    expect(migration).toContain("coalesce(is_off_market, false) = false");
  });

  it("inserts view events only from rows updated by the visibility guard", () => {
    expect(normalizedSql).toContain("returning id");
    expect(normalizedSql).toContain("insert into public.listing_view_events (listing_id, viewer_id)");
    expect(normalizedSql).toContain("select id, p_viewer_id");
    expect(normalizedSql).toContain("from visible_listing");
  });

  it("keeps the RPC service-role only", () => {
    expect(normalizedSql).toContain(
      "revoke all on function public.record_listing_view(uuid, uuid) from public, anon, authenticated",
    );
    expect(normalizedSql).toContain(
      "grant execute on function public.record_listing_view(uuid, uuid) to service_role",
    );
  });
});
