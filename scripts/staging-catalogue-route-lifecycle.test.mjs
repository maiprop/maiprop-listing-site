import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "e2e/staging-catalogue-gates.spec.ts"),
  "utf8",
);

test("protected staging routes drain without hiding active handler failures", () => {
  assert.match(source, /await page\.route\(`\$\{STAGING_BASE_URL\}\/\*\*`/);
  assert.doesNotMatch(source, /page\.context\(\)\.route\(`\$\{STAGING_BASE_URL\}\/\*\*`/);
  assert.match(
    source,
    /async function drainProtectedPagesRoutes\(page: Page\)[\s\S]*?page\.unrouteAll\(\{ behavior: "wait" \}\)/,
  );
  assert.match(
    source,
    /test\.afterEach\(async \(\{ page \}\) => \{\s*await drainProtectedPagesRoutes\(page\);\s*\}\)/,
  );
  assert.match(
    source,
    /const freshPage = await page\.context\(\)\.newPage\(\);[\s\S]*?await configureProtectedPagesContext\(freshPage\);[\s\S]*?finally \{\s*await drainProtectedPagesRoutes\(freshPage\);\s*await freshPage\.close\(\);/,
  );
  assert.match(source, /maxRedirects: 0/);
  assert.doesNotMatch(source, /ignoreErrors/);
});
