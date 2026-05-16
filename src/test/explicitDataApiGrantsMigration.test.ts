import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707060000_explicit_data_api_grants.sql"),
  "utf8",
);

describe("explicit Data API grants migration", () => {
  it("adds explicit schema and policy-derived table grants for client roles", () => {
    expect(migration).toContain("GRANT USAGE ON SCHEMA public TO anon, authenticated");
    expect(migration).toContain("FROM pg_policies p");
    expect(migration).toContain("'GRANT %s ON TABLE %I.%I TO %I'");
    expect(migration).toContain("expected anon SELECT on public.listings");
    expect(migration).toContain("expected anon INSERT on public.contact_submissions");
  });

  it("keeps service-only/internal tables closed to Data API client roles", () => {
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.rate_limit_counters FROM anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.email_send_log FROM anon, authenticated",
    );
    expect(migration).toContain("rate_limit_counters must remain closed");
  });

  it("preserves profiles column-level update boundaries", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.profiles FROM anon");
    expect(migration).toContain("REVOKE UPDATE ON TABLE public.profiles FROM authenticated");
    expect(migration).toContain("GRANT UPDATE (");
    expect(migration).toContain("participant_type");
    expect(migration).toContain("authenticated must not update public.profiles.is_platform_admin");
    expect(migration).toContain("authenticated must not update public.profiles.force_pro_access");
  });
});
