import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260901120000_repair_subsecond_release_capabilities.sql",
  ),
  "utf8",
);

const compactMigration = migration
  .replace(/\s+/g, " ")
  .replace(/\(\s+/g, "(")
  .replace(/\s+\)/g, ")");

const visibleAuctionWrapper =
  migration.match(
    /CREATE OR REPLACE FUNCTION public\.get_visible_auction_candidates\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";

const preflightAssertions =
  migration.match(/DO \$\$\nBEGIN[\s\S]*?END\n\$\$;/)?.[0] ?? "";

const postCreateAssertions =
  migration.match(/DO \$\$\nDECLARE\n  signature TEXT;[\s\S]*?END\n\$\$;/)?.[0] ?? "";

describe("subsecond release capability repair migration", () => {
  it("adds a bounded public wrapper over the service-role-only auction RPC", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_visible_auction_candidates(",
    );
    expect(visibleAuctionWrapper).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = ''/,
    );
    expect(visibleAuctionWrapper).toContain("v_user_id UUID := auth.uid()");
    expect(visibleAuctionWrapper).toContain("v_visible_limit INTEGER := 60");
    expect(visibleAuctionWrapper).toContain("LEAST(\n      600,");
    expect(visibleAuctionWrapper).toContain(
      "COALESCE(public.get_auction_listing_visible_limit(v_user_id), 60)",
    );
    expect(visibleAuctionWrapper).toContain(
      "LEAST(GREATEST(COALESCE(p_limit, 1), 1), v_visible_limit, 600)",
    );
    expect(visibleAuctionWrapper).toContain(
      "FROM public.get_public_auction_candidates(",
    );
    expect(visibleAuctionWrapper).not.toContain("FROM public.listings");
    expect(compactMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_visible_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) FROM PUBLIC",
    );
    expect(compactMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_visible_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) TO anon, authenticated",
    );
    expect(compactMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated",
    );
    expect(compactMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) TO service_role",
    );
  });

  it("restores management and professional projections with their original grants", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_manageable_listing_catalogue_page(",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_manageable_listing_summary()",
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_manageable_listing_catalogue_page\([\s\S]*?\) TO authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_manageable_listing_summary\(\)\s+TO authenticated/,
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_public_professionals()",
    );
    expect(migration).toContain("CREATE OR REPLACE VIEW public.public_professionals");
    expect(migration).toContain("security_barrier = true, security_invoker = true");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_public_professionals\(\)\s+TO anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /GRANT SELECT ON TABLE public\.public_professionals\s+TO anon, authenticated, service_role/,
    );
  });

  it("fails closed on runtime dependencies before creation and validates capabilities before reloading PostgREST", () => {
    expect(preflightAssertions).toContain("to_regclass('public.listing_management_catalogue')");
    expect(preflightAssertions).toContain("to_regclass('public.listings')");
    expect(preflightAssertions).toContain("to_regclass('public.professionals')");
    expect(preflightAssertions).toContain("to_regprocedure('auth.uid()')");
    expect(preflightAssertions).toContain(
      "public.get_auction_listing_visible_limit(uuid)",
    );
    expect(preflightAssertions).toContain(
      "private.has_org_permission(uuid,text,uuid)",
    );
    expect(preflightAssertions).toContain(
      "public.get_public_auction_candidates(integer,text,date,timestamp with time zone,text)",
    );
    expect(migration.indexOf(preflightAssertions)).toBeGreaterThanOrEqual(0);
    expect(migration.indexOf(preflightAssertions)).toBeLessThan(
      migration.indexOf("CREATE OR REPLACE FUNCTION"),
    );
    expect(postCreateAssertions).toContain("FOREACH signature IN ARRAY ARRAY[");
    expect(postCreateAssertions).toContain(
      "public.get_visible_auction_candidates(integer,text,date,timestamp with time zone,text)",
    );
    expect(postCreateAssertions).toContain(
      "public.get_manageable_listing_catalogue_page(integer,timestamp with time zone,uuid)",
    );
    expect(postCreateAssertions).toContain("public.get_manageable_listing_summary()");
    expect(postCreateAssertions).toContain("public.get_public_professionals()");
    expect(postCreateAssertions).toContain("to_regprocedure(signature)");
    expect(postCreateAssertions).toContain("to_regclass('public.public_professionals')");
    expect(migration.indexOf(postCreateAssertions)).toBeGreaterThan(
      migration.indexOf("CREATE OR REPLACE VIEW public.public_professionals"),
    );
    expect(migration.indexOf("NOTIFY pgrst, 'reload schema';")).toBeGreaterThan(
      migration.indexOf(postCreateAssertions),
    );
    expect(migration).toMatch(/NOTIFY pgrst, 'reload schema';\s*$/);
    expect(migration.toLowerCase()).not.toContain("supabase_service_role_key");
    expect(migration.toLowerCase()).not.toContain("service-role secret");
  });
});
