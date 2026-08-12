import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726222529_add_storage_cleanup_outbox.sql",
  ),
  "utf8",
);

describe("storage cleanup outbox migration", () => {
  it("keeps cleanup jobs service-only and claims work with skip-locked semantics", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.storage_cleanup_jobs");
    expect(migration).toContain("ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY");
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.storage_cleanup_jobs FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.storage_cleanup_jobs TO service_role/i,
    );
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_storage_cleanup_jobs");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_storage_cleanup_jobs\(integer\)\s+FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_storage_cleanup_jobs\(integer\)\s+TO service_role/i,
    );
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.is_storage_object_committed");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.is_storage_object_committed\(text\)\s+TO service_role/i,
    );
  });

  it("schedules only a secret-authenticated Edge cleanup invocation", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.invoke_storage_cleanup_cron");
    expect(migration).toContain("'x-cron-secret', v_cron_secret");
    expect(migration).toContain("/functions/v1/process-storage-cleanup");
    expect(migration).toContain("'process-storage-cleanup'");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.invoke_storage_cleanup_cron\(\)\s+FROM PUBLIC, anon, authenticated/i,
    );
  });
});
