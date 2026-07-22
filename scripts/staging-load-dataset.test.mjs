import { describe, expect, it } from 'vitest';
import {
  buildCleanupSql,
  buildCleanupAllSql,
  buildSeedSql,
  STAGING_PROJECT_REF,
  validateStagingDatasetConfig,
} from './staging-load-dataset.mjs';

const stagingUrl = `postgresql://postgres.${STAGING_PROJECT_REF}:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

function validEnv(overrides = {}) {
  return {
    ALLOW_STAGING_LOAD_DATASET: 'true',
    STAGING_SUPABASE_PROJECT_ID: STAGING_PROJECT_REF,
    SUPABASE_STAGING_DB_URL: stagingUrl,
    ...overrides,
  };
}

describe('staging load dataset guard', () => {
  it('requires explicit staging load approval', () => {
    const result = validateStagingDatasetConfig({
      env: validEnv({ ALLOW_STAGING_LOAD_DATASET: 'false' }),
      argv: ['--run-id', 'approved-run'],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('ALLOW_STAGING_LOAD_DATASET=true is required.');
  });

  it('rejects a production project or connection identity', () => {
    const result = validateStagingDatasetConfig({
      env: validEnv({
        STAGING_SUPABASE_PROJECT_ID: 'qvvicunqcrwpioqnvzxf',
        SUPABASE_STAGING_DB_URL: 'postgresql://postgres.qvvicunqcrwpioqnvzxf:password@pooler.supabase.com/postgres',
      }),
      argv: ['--run-id', 'blocked-prod'],
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/production|isolated staging/i);
  });

  it('accepts only the controlled 1k and 10k datasets', () => {
    for (const target of ['1000', '10000']) {
      const result = validateStagingDatasetConfig({
        env: validEnv(),
        argv: ['--run-id', `size-${target}`, '--target-count', target],
      });
      expect(result.ok).toBe(true);
      expect(result.config.targetCount).toBe(Number(target));
    }

    const invalid = validateStagingDatasetConfig({
      env: validEnv(),
      argv: ['--run-id', 'size-invalid', '--target-count', '50000'],
    });
    expect(invalid.ok).toBe(false);
  });
});

describe('staging load dataset SQL', () => {
  it('models listings, projects, units, images, organizations, and promotions', () => {
    const sql = buildSeedSql({ tag: 'ecas-load:unit-test', targetCount: 1_000 });
    expect(sql).toContain('INSERT INTO public.listings');
    expect(sql).toContain('INSERT INTO public.projects');
    expect(sql).toContain('INSERT INTO public.project_units');
    expect(sql).toContain('INSERT INTO public.listing_images');
    expect(sql).toContain('INSERT INTO public.organizations');
    expect(sql).toContain('INSERT INTO public.listing_promotion_allocations');
    expect(sql).toContain("SET LOCAL app.ecas_load_test = 'true'");
    expect(sql).toContain('staging_demo_accounts_missing');
    expect(sql).toContain('ALTER TABLE public.listings DISABLE TRIGGER trg_featured_listing_notify');
    expect(sql).toContain('ALTER TABLE public.listings ENABLE TRIGGER trg_featured_listing_notify');
    expect(sql).toContain('staging_dataset_count_mismatch');
  });

  it('cleans every synthetic relation by a run-specific tag', () => {
    const sql = buildCleanupSql('ecas-load:unit-test');
    expect(sql).toContain('DELETE FROM public.listing_promotion_allocations');
    expect(sql).toContain('DELETE FROM public.project_units');
    expect(sql).toContain('DELETE FROM public.project_media');
    expect(sql).toContain('DELETE FROM public.listing_images');
    expect(sql).toContain('DELETE FROM public.listings');
    expect(sql).toContain('DELETE FROM public.projects');
    expect(sql).toContain('DELETE FROM public.organizations');
  });

  it('can remove orphaned ECAS datasets without matching ordinary staging data', () => {
    const sql = buildCleanupAllSql();
    expect(sql).toContain("request_key LIKE 'ecas-load:%'");
    expect(sql).toContain("tag LIKE 'ecas-load:%'");
    expect(sql).toContain("settings ->> 'ecas_load_tag' LIKE 'ecas-load:%'");
  });
});
