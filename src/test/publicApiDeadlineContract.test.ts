import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function numericConstant(source: string, name: string): number {
  const match = source.match(new RegExp(`(?:const|export const)\\s+${name}\\s*=\\s*([0-9_]+)`));
  if (!match) throw new Error(`Missing numeric constant ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

describe("public API deadline contract", () => {
  it("keeps browser deadlines above Worker producer deadlines", () => {
    const publicApi = readFileSync("src/lib/publicApi.ts", "utf8");
    const homepageHook = readFileSync("src/hooks/useHomepageListings.ts", "utf8");
    const listingsWorker = readFileSync("functions/api/public/listings.ts", "utf8");
    const homepageWorker = readFileSync("functions/api/public/homepage.ts", "utf8");

    const browserDefault = numericConstant(publicApi, "PUBLIC_API_TIMEOUT_MS");
    const homepageBrowser = numericConstant(homepageHook, "HOMEPAGE_SECTION_TIMEOUT_MS");
    const listingsProducerMatch = listingsWorker.match(/producerTimeoutMs:\s*([0-9_]+)/);
    if (!listingsProducerMatch) throw new Error("Missing listings producer timeout");
    const listingsProducer = Number(listingsProducerMatch[1].replaceAll("_", ""));
    const homepageProducer = numericConstant(homepageWorker, "HOMEPAGE_PRODUCER_TIMEOUT_MS");

    expect(browserDefault).toBeGreaterThanOrEqual(listingsProducer + 1_000);
    expect(homepageBrowser).toBeGreaterThanOrEqual(homepageProducer + 1_000);
  });
});
