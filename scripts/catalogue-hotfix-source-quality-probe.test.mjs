import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogueSourceQualitySql,
  runCatalogueSourceQualityProbe,
  validateCatalogueSourceQuality,
} from "./catalogue-hotfix-source-quality-probe.mjs";

const validQuality = {
  schema_version: 1,
  kind: "maiprop-catalogue-source-quality",
  eligible_active_listings: 120,
  auction_listings: 30,
  auction_rows_without_tag: 2,
  auction_rows_with_multiple_tags: 1,
  invalid_tag_rows: 3,
  placeholder_tag_rows: 4,
  duplicate_tag_groups: 2,
  duplicate_tag_rows: 5,
  duplicate_placeholder_groups: 1,
  duplicate_nonplaceholder_groups: 1,
  max_duplicate_multiplicity: 3,
  all_os_source_rows: 40,
  all_os_source_rows_with_invalid_identity: 0,
  all_os_identity_rows: 35,
  all_os_identity_rows_with_owner: 0,
  quarantine_candidate_rows: 5,
  quarantine_candidates_with_owner: 0,
  quarantine_candidates_with_active_promotion: 0,
};

test("source-quality SQL emits only aggregate counts for the catalogue bootstrap population", () => {
  const sql = buildCatalogueSourceQualitySql();

  assert.match(sql, /FROM public\.listings AS listing/);
  assert.match(sql, /listing\.status = 'active'/);
  assert.match(sql, /COALESCE\(listing\.is_off_market, false\) = false/);
  assert.match(sql, /listing\.created_at <= date_trunc\('minute', clock_timestamp\(\)\)/);
  assert.match(sql, /supervisor-\[0-9\]\+/);
  assert.match(sql, /os_auction:%/);
  assert.match(sql, /GROUP BY source\.os_tag/);
  assert.match(sql, /listing\.owner_id/);
  assert.match(sql, /listing_promotion_allocations/);
  assert.match(sql, /all_os_source_rows/);
  assert.match(sql, /source:maiprop-os/);
  assert.match(sql, /source:maiprop-os-duplicate-quarantine/);
  assert.match(sql, /identity\.provider_id ~ '\^\[a-z0-9:_-\]\{1,120\}\$'/);
  assert.match(
    sql,
    /'all_os_identity_rows_with_owner',[\s\S]*?FROM ranked_os_rows AS os_identity[\s\S]*?os_identity\.owner_id IS NOT NULL/,
  );
  assert.doesNotMatch(sql, /json_agg|array_agg|string_agg/);
  assert.doesNotMatch(sql, /listing\.title\s+AS|listing\.address\s+AS|listing\.owner_id\s+AS/);
});

test("source-quality runner returns and writes the validated fixed-schema aggregate", async () => {
  const writes = [];
  const queries = [];
  const result = await runCatalogueSourceQualityProbe({
    databaseUrl: "postgresql://safe.invalid/postgres",
    outputPath: "quality.json",
  }, {
    psql: async (query) => {
      queries.push(query);
      return JSON.stringify(validQuality);
    },
    writeFile: (path, value) => writes.push([path, value]),
  });

  assert.deepEqual(result, validQuality);
  assert.equal(queries.length, 1);
  assert.deepEqual(writes, [["quality.json", `${JSON.stringify(validQuality, null, 2)}\n`]]);
});

test("source-quality validation fails closed on extra, nonnumeric, negative, or inconsistent fields", () => {
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, leaked_identifier: "auction-123" }),
    /schema/i,
  );
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, auction_listings: "30" }),
    /integer/i,
  );
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, duplicate_tag_groups: -1 }),
    /integer/i,
  );
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, duplicate_tag_rows: 1 }),
    /inconsistent/i,
  );
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, duplicate_placeholder_groups: 2, duplicate_nonplaceholder_groups: 2 }),
    /inconsistent/i,
  );
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, quarantine_candidates_with_owner: 1 }),
    /manual ownership or promotion review/i,
  );
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, quarantine_candidates_with_active_promotion: 1 }),
    /manual ownership or promotion review/i,
  );
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, all_os_identity_rows_with_owner: 1 }),
    /OS identity rows must not have owners/i,
  );
  assert.throws(
    () => validateCatalogueSourceQuality({ ...validQuality, all_os_source_rows_with_invalid_identity: 1 }),
    /all-status OS source identity contract/i,
  );
});
