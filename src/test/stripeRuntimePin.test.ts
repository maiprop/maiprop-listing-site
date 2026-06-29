import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const collectTsFiles = (dir: string): string[] => {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (fullPath.includes(`${join("supabase", "functions", "node_modules")}`)) {
      return [];
    }
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return collectTsFiles(fullPath);
    return entry.endsWith(".ts") ? [fullPath] : [];
  });
};

const files = collectTsFiles(join(process.cwd(), "supabase/functions"));

describe("Stripe Edge runtime pin", () => {
  it("uses the shared 2026 Stripe runtime instead of legacy per-file pins", () => {
    const offenders = files
      .map((file) => {
        const source = readFileSync(file, "utf8");
        const hasLegacySdk = source.includes("npm:stripe@18.5.0");
        const hasLegacyApi = source.includes("2025-08-27.basil");
        return hasLegacySdk || hasLegacyApi
          ? `${relative(process.cwd(), file)}: ${[
            hasLegacySdk ? "stripe@18.5.0" : null,
            hasLegacyApi ? "2025-08-27.basil" : null,
          ].filter(Boolean).join(", ")}`
          : null;
      })
      .filter(Boolean);

    expect(offenders).toEqual([]);
  });
});
