import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/20260921055243_restore_auction_only_reader_capabilities.sql";
const sql = readFileSync(path, "utf8");
const source = (file) => readFileSync(`supabase/migrations/${file}`, "utf8");

function definition(text, name) {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const rest = text.slice(start);
  const body = rest.match(/AS (\$[a-z_]*\$)/i);
  if (!body) throw new Error(`Missing body ${name}`);
  const end = rest.indexOf(body[1] + ";", body.index + body[0].length);
  if (end < 0) throw new Error(`Unterminated body ${name}`);
  return rest.slice(0, end + body[1].length + 1).replaceAll("\r\n", "\n");
}

describe("auction-only recovery scope", () => {
  it.each([
    ["get_public_auction_candidates", "20260726201049_public_auction_candidate_boundary.sql"],
    ["get_current_auction_listing_visible_limit", "20260901120000_repair_subsecond_release_capabilities.sql"],
  ])("restores the canonical %s implementation without unrelated replay", (name, file) => {
    expect(definition(sql, name)).toBe(definition(source(file), name));
  });

  it("preserves the envelope API while enforcing authorization inside the database", () => {
    const actual = definition(sql, "get_visible_auction_candidate_envelope");
    const previous = definition(source("20260901130000_add_visible_auction_candidate_envelopes.sql"), "get_visible_auction_candidate_envelope");
    expect(actual.split("AS $function$")[0].replace("SET timezone = 'UTC'\n", "")).toBe(previous.split("AS $function$")[0]);
    expect(actual).toContain("IF v_visible_limit <= 60 THEN");
    expect(actual).toContain("SET timezone = 'UTC'");
  });

  it("changes only three auction functions and one auction index", () => {
    expect([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map(m => m[1])).toEqual([
      "get_public_auction_candidates",
      "get_current_auction_listing_visible_limit",
      "get_visible_auction_candidate_envelope",
    ]);
    expect(sql).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+(?:FUNCTION|TABLE|INDEX)|CREATE\s+(?:TABLE|TRIGGER|POLICY))\b/i);
    expect(sql).not.toMatch(/supabase_migrations|cron\.|marketing_leads|user_roles|bulk_update_project|stripe|billing/i);
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_listings_public_auction_order_v1");
    expect(sql).toContain("SET LOCAL lock_timeout = '3s'");
  });

  it("never grants the internal reader to public roles", () => {
    const grants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.get_public_auction_candidates\([\s\S]*?TO ([^;]+);/g)];
    expect(grants).toHaveLength(1);
    expect(grants[0][1].trim()).toBe("service_role");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
    expect(sql).toContain("pg_catalog.has_function_privilege");
  });
});
