import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const browserFiles = [
  "src/hooks/useListingMutations.ts",
  "src/hooks/useListingForm.ts",
  "src/hooks/useListings.ts",
  "src/hooks/useContacts.ts",
  "src/hooks/useLeads.ts",
  "src/hooks/useMessages.ts",
  "src/hooks/useViewings.ts",
  "src/hooks/useFavorites.ts",
  "src/hooks/useProjects.ts",
];

describe("browser listing data boundary", () => {
  it.each(browserFiles)("keeps %s off the raw listings table", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/\.from\(\s*["']listings["']\s*\)/);
  });
});
