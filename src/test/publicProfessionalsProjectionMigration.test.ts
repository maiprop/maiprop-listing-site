import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260726184938_protect_public_professional_projection.sql",
  "utf8",
);

describe("public professional projection migration", () => {
  it("exposes only a fixed public projection", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE VIEW public.public_professionals",
    );
    expect(migration).toContain("WHERE professional.archived_at IS NULL");
    expect(migration).not.toMatch(
      /SELECT[\s\S]*professional\.(rejection_reason|calendar_notes|notes)/i,
    );
    expect(migration).toMatch(
      /GRANT SELECT ON TABLE public\.public_professionals\s+TO anon, authenticated, service_role/,
    );
  });

  it("restricts raw professional rows to the owner or platform admin", () => {
    expect(migration).toContain('CREATE POLICY "professionals_select"');
    expect(migration).toMatch(
      /TO authenticated[\s\S]*auth\.uid\(\)\) = user_id[\s\S]*private\.has_platform_admin/,
    );
    expect(migration).not.toMatch(
      /CREATE POLICY "professionals_select"[\s\S]*TO public/,
    );
  });
});
