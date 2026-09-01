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

describe("subsecond release capability repair migration", () => {
  it("adds a bounded public wrapper over the service-role-only auction RPC", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_visible_auction_candidates(",
    );
    expect(migration).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = ''/,
    );
    expect(migration).toContain("v_user_id UUID := auth.uid()");
    expect(migration).toContain("v_visible_limit INTEGER := 60");
    expect(migration).toContain("LEAST(\n      600,");
    expect(migration).toContain(
      "COALESCE(public.get_auction_listing_visible_limit(v_user_id), 60)",
    );
    expect(migration).toContain(
      "LEAST(GREATEST(COALESCE(p_limit, 1), 1), v_visible_limit, 600)",
    );
    expect(migration).toContain("FROM public.get_public_auction_candidates(");
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

  it("asserts every restored capability before reloading PostgREST without secret bindings", () => {
    expect(migration).toContain("public.listing_management_catalogue");
    expect(migration).toContain(
      "public.get_public_auction_candidates(integer,text,date,timestamp with time zone,text)",
    );
    expect(migration).toContain(
      "public.get_visible_auction_candidates(integer,text,date,timestamp with time zone,text)",
    );
    expect(migration).toContain(
      "public.get_manageable_listing_catalogue_page(integer,timestamp with time zone,uuid)",
    );
    expect(migration).toContain("public.get_manageable_listing_summary()");
    expect(migration).toContain("public.get_public_professionals()");
    expect(migration).toContain("public.public_professionals");
    expect(migration).toContain("to_regprocedure");
    expect(migration).toContain("to_regclass");
    expect(migration).toMatch(/NOTIFY pgrst, 'reload schema';\s*$/);
    expect(migration.toLowerCase()).not.toContain("supabase_service_role_key");
    expect(migration.toLowerCase()).not.toContain("service-role secret");
  });
});
