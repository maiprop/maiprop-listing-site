import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_preserve_lead_origin_context_on_resource_deletion\.sql$/.test(name)
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";

describe("lead origin context deletion lifecycle", () => {
  it("persists the original resource context before a linked resource is deleted", () => {
    expect(migrationName).toBeTruthy();
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS origin_context_key text");
    expect(migration).toContain("'listing:' || listing_id::text");
    expect(migration).toContain("'professional:' || professional_id::text");
    expect(migration).toContain("'project:' || project_id::text");
    expect(migration).toContain("ALTER COLUMN origin_context_key SET NOT NULL");
  });

  it("keeps the context immutable while foreign keys are nullified", () => {
    expect(migration).toContain("private.set_lead_origin_context_key");
    expect(migration).toContain("NEW.origin_context_key := OLD.origin_context_key");
    expect(migration).toContain("BEFORE INSERT ON public.leads");
    expect(migration).toContain("BEFORE UPDATE OF origin_context_key ON public.leads");
  });

  it("deduplicates by durable origin instead of nullable foreign keys", () => {
    expect(migration).toContain("DROP INDEX IF EXISTS public.idx_leads_auto_unique_email_context");
    expect(migration).toContain("DROP INDEX IF EXISTS public.idx_leads_auto_unique_phone_context");
    expect(migration).toContain("owner_id, origin_context_key, lower(btrim(email))");
    expect(migration).toContain("owner_id, origin_context_key,");
    expect(migration).toContain("lead.origin_context_key = v_context_key");
  });
});
