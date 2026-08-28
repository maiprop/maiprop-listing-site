import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { validateCataloguePerformanceHotfix } from "./catalogue-performance-hotfix-contract.mjs";

const MIGRATIONS = [
  {
    path: "supabase/migrations/20260728123058_materialize_public_catalogue_snapshots.sql",
    sha256: "0333355f5bd97bcdbe401743afeb93ef302e1f0b23f4a2cf0715cc85e5f476ff",
  },
  {
    path: "supabase/migrations/20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql",
    sha256: "f20d21b6c1368d0406e607a308ddd68ff1deaaf98a7d2a73927d857ddf7d85aa",
  },
];

const manifest = () => ({
  version: 1,
  live_pages_sha: "db53d1b9adae41edae93fbeb3e612b42dd8fec0b",
  targets: {
    staging_project_ref: "xsiehskfgeoqyazcgauv",
    production_project_ref: "qvvicunqcrwpioqnvzxf",
  },
  latency_ceilings_ms: {
    cold_12_card_p95: 1800,
    warm_12_card_p95: 1000,
  },
  migrations: MIGRATIONS.map((migration) => ({ ...migration })),
});

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "catalogue-performance-hotfix-"));
  try {
    for (const migration of MIGRATIONS) {
      const target = join(root, migration.path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(process.cwd(), migration.path), target);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("accepts only the exact materialized catalogue migration contract", () => {
  withFixture((root) => {
    const result = validateCataloguePerformanceHotfix(root, manifest());

    assert.deepEqual(result, {
      version: 1,
      livePagesSha: "db53d1b9adae41edae93fbeb3e612b42dd8fec0b",
      targets: {
        stagingProjectRef: "xsiehskfgeoqyazcgauv",
        productionProjectRef: "qvvicunqcrwpioqnvzxf",
      },
      latencyCeilingsMs: {
        cold12CardP95: 1800,
        warm12CardP95: 1000,
      },
      migrations: [
        {
          version: "20260728123058",
          path: "supabase/migrations/20260728123058_materialize_public_catalogue_snapshots.sql",
          sha256: "0333355f5bd97bcdbe401743afeb93ef302e1f0b23f4a2cf0715cc85e5f476ff",
        },
        {
          version: "20260729120405",
          path: "supabase/migrations/20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql",
          sha256: "f20d21b6c1368d0406e607a308ddd68ff1deaaf98a7d2a73927d857ddf7d85aa",
        },
      ],
    });
  });
});

test("rejects catalogue hotfix scope, digest, and SQL safety drift", async (t) => {
  const cases = [
    ["unknown migration path", (value) => { value.migrations[1].path = "supabase/migrations/20990101000000_unknown.sql"; }, /approved migration path/i],
    ["duplicate migration path", (value) => { value.migrations[1].path = value.migrations[0].path; }, /duplicate migration path/i],
    ["digest mismatch", (value) => { value.migrations[0].sha256 = "0".repeat(64); }, /digest mismatch/i],
    ["malformed SHA-256", (value) => { value.migrations[0].sha256 = "not-a-digest"; }, /SHA-256 digest/i],
    ["non-SQL migration", (value) => { value.migrations[0].path = "supabase/migrations/catalogue.mjs"; }, /SQL migration/i],
    ["unknown manifest field", (value) => { value.unreviewed = true; }, /unknown manifest field/i],
    ["Stripe secret token", (value, root) => { writeFileSync(join(root, value.migrations[0].path), "select 'STRIPE_SECRET_KEY';\n"); }, /Stripe secret token/i],
    ["billing table mutation", (value, root) => { writeFileSync(join(root, value.migrations[0].path), "update billing_invoices set status = 'paid';\n"); }, /billing.*table mutation/i],
    ["subscription table mutation", (value, root) => { writeFileSync(join(root, value.migrations[0].path), "delete from subscriptions;\n"); }, /subscription.*table mutation/i],
    ["payment table mutation", (value, root) => { writeFileSync(join(root, value.migrations[0].path), "insert into payment_events values (1);\n"); }, /payment.*table mutation/i],
  ];

  for (const [name, mutate, expected] of cases) {
    await t.test(`fails closed for ${name}`, () => {
      withFixture((root) => {
        const value = manifest();
        mutate(value, root);
        assert.throws(() => validateCataloguePerformanceHotfix(root, value), expected);
      });
    });
  }
});
