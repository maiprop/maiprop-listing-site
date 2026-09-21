import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("serves concurrent open-house requests without sharing response streams between Workers invocations", () => {
  const output = execFileSync(process.execPath, ["scripts/test-support/public-api-worker-cache.mjs"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 12000,
  });
  const { responses, reads, cached } = JSON.parse(output.trim());
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  expect(responses.map(response => response.cache)).toEqual(["MISS", "COALESCED"]);
  const expected = { data: [], hasMore: false, nextCursor: null, limit: 60, publicationId: 42 };
  for (const response of responses) expect(JSON.parse(response.body)).toEqual(expected);
  expect(reads).toBe("1");
  expect(cached.status).toBe(200);
  expect(cached.cache).toBe("HIT");
  expect(JSON.parse(cached.body)).toEqual(expected);
});
