import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "scripts/capture-supabase-index-stats.mjs"),
  "utf8",
);

describe("capture Supabase index stats script", () => {
  it("supports direct DB URLs for staging and production workflows before linked fallback", () => {
    expect(script).toContain('readArg("--db-url")');
    expect(script).toContain("process.env.SUPABASE_STAGING_EFFECTIVE_DB_URL");
    expect(script).toContain("process.env.SUPABASE_PRODUCTION_DB_URL");
    expect(script).toContain("process.env.SUPABASE_DB_PASSWORD");
    expect(script).toContain('"supabase", "link"');
    expect(script).toContain('queryArgs.push("--db-url", dbUrl)');
    expect(script).toContain('queryArgs.push("--linked")');
  });

  it("accepts both JSON array and object row payloads from Supabase CLI output", () => {
    expect(script).toContain("function firstJsonValue(text)");
    expect(script).toContain("Array.isArray(payload)");
    expect(script).toContain("Array.isArray(payload.rows)");
    expect(script).toContain("Array.isArray(payload.data)");
  });
});
