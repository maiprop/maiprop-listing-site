import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260726184938_protect_public_professional_projection.sql",
  "utf8",
);
const correctionName = readdirSync("supabase/migrations").find((name) =>
  /^\d{14}_replace_public_professional_definer_view\.sql$/.test(name),
);
const correction = correctionName
  ? readFileSync(`supabase/migrations/${correctionName}`, "utf8")
  : "";

describe("public professional projection migration", () => {
  it("replaces the definer view with an invoker view over a constrained function", () => {
    expect(correctionName).toBeDefined();
    expect(correction).toContain(
      "CREATE OR REPLACE FUNCTION public.get_public_professionals()",
    );
    expect(correction).toMatch(
      /SECURITY DEFINER[\s\S]*SET search_path = ''/,
    );
    expect(correction).toMatch(
      /CREATE OR REPLACE VIEW public\.public_professionals[\s\S]*security_invoker\s*=\s*true/,
    );
    expect(correction).toMatch(
      /professional\.rating::numeric\(3,\s*2\)\s+AS rating/,
    );
    expect(correction).toMatch(
      /professional\.hourly_rate::numeric\(10,\s*2\)\s+AS hourly_rate/,
    );
    expect(correction).not.toMatch(
      /CREATE OR REPLACE VIEW public\.public_professionals[\s\S]*SELECT \*/,
    );
    expect(correction).toContain("WHERE professional.archived_at IS NULL");
    expect(correction).toMatch(/\brating numeric\(3,\s*2\)/);
    expect(correction).toMatch(/\bhourly_rate numeric\(10,\s*2\)/);
    expect(correction).not.toMatch(
      /SELECT[\s\S]*professional\.(rejection_reason|calendar_notes|notes)/i,
    );
    expect(correction).toMatch(
      /GRANT SELECT ON TABLE public\.public_professionals\s+TO anon, authenticated, service_role/,
    );
    expect(correction).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_public_professionals\(\)\s+FROM PUBLIC, anon, authenticated/,
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
