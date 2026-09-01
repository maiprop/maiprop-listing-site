# Staging Promotion Checklist

Use this checklist before promoting the hardening branch to staging or production.
The default posture is local-only: no live app, database, or edge-function changes
until every gate below has an owner and a recorded result.

## Live-Safety Boundary

- [ ] Confirm the branch under review is not `main`.
- [ ] Confirm no command in the review used `supabase db push`, `supabase functions deploy`, Cloudflare deploy, or production data mutation.
- [ ] Confirm database, Edge, and Cloudflare production workflows are reusable-call-only boundaries.
- [ ] Confirm destructive E2E tests require `E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS=true` and an allowlisted non-production project ref.
- [ ] Record the live Supabase project ref and the staging Supabase project ref.
- [ ] Confirm `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STAGING_ACCOUNT_ID` are present, belong to dedicated production/staging accounts, and differ.
- [ ] Confirm production promotion has only staging read credentials; staging edit credentials remain confined to the staging environment.

## Clean Verification

Run from a clean checkout on the pinned Node toolchain:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
npm run lint:migrations
npm run check:public-functions
npm run check:release-safety
npm run test:e2e:live-smoke
```

Expected result: every command exits 0.

## Read-Only Live Inventory

- [ ] Run `npx supabase functions list --project-ref <prod-ref>` and save the output to the release notes.
- [ ] Compare live functions with `supabase/functions` and `supabase/config.toml`.
- [ ] Classify every live function not present in the repo as `delete`, `import`, or `legacy accepted risk`.
- [ ] Do not delete or deploy functions during this inventory step.

## Migration Preflight

- [ ] Confirm `supabase/reconciliation/production-history-v1.json` still names
      the exact reviewed legacy anomalies and binds every canonical SQL hash.
- [ ] Confirm staging uses one dry-run and one lease-bound `supabase db push`.
      The only permitted history rewrite is the exact-SHA, staging-only bootstrap
      lane for the fixed reviewed alias map; it must be explicitly enabled with
      `REPAIR_REVIEWED_STAGING_MIGRATION_ALIASES <exact-release-sha>`, prove the
      canonical repair plan is empty afterward, and be disabled after success.
      Reject every production `supabase migration repair`, every direct write to
      `supabase_migrations.schema_migrations`, and every unknown staging alias.
- [ ] Capture the read-only legacy schema evidence and pgTap convergence proof;
      bind both digests into the signed staging database attestation.
- [ ] Confirm production preflight accepts only the fixed manifest, applies the
      forward cutover migration normally, and requires its post-apply schema
      evidence to equal the signed staging evidence byte for byte.

Before applying migrations to staging or production, run read-only duplicate checks:

```sql
select listing_id, count(*)
from public.open_house_offers
where status = 'accepted'
group by listing_id
having count(*) > 1;

select deal_id, count(*)
from public.firesale_interest
where status in ('engaged', 'won')
   or (status = 'reserved' and coalesce(reservation_expires_at, now() + interval '100 years') > now())
group by deal_id
having count(*) > 1;
```

Expected result: both queries return zero rows. If either query returns rows,
pause and resolve the data with an explicit incident/remediation note before
applying constraints.

## Staging Apply

- [ ] Apply migrations to staging only.
- [ ] Deploy edge functions to staging only.
- [ ] Deploy the frontend to staging only.
- [ ] Confirm the canonical production N-1 identity and attempt-qualified CI artifact were captured before the first staging mutation.
- [ ] Run the captured N-1 frontend against the newly staged Supabase database and Edge Functions; require zero skipped, unexpected, or flaky catalogue tests.
- [ ] Verify the immutable deployment URL and stable staging origin both pass public API latency and payload budgets.
- [ ] Verify homepage, listings, auctions, and open houses render live staged data; homepage auction identity routes to the same auction detail and AI Market Insights is visible.
- [ ] Reject any catalogue proof that calls direct `/rest/v1/listings` or `fetch-os-auctions` authority fallbacks.
- [ ] Require exact-SHA LCP <= 3000 ms, CLS <= 0.1, INP <= 200 ms, and per-route Supabase query budgets for homepage, listings, auctions, and open houses.
- [ ] Verify staging and production Pages runtime bindings were pre-provisioned and attested read-only; reject any release-train project-settings PATCH.
- [ ] Run `node scripts/check-supabase-types-freshness.cjs --strict` against the staging project.
- [ ] Run staging RLS/security E2E.
- [ ] Run `npm run test:e2e:live-smoke` for account deletion auth, checkout eligibility, role approval, firesale, and open-house smoke coverage.
- [ ] Run destructive GDPR deletion and mutation drills only against the allowlisted staging Supabase project.
- [ ] Verify Sentry/logs contain the new release SHA and no new error burst.

## Production Promotion

Production is eligible only after staging is green:

- [ ] CI is green on the pinned Node version.
- [ ] Branch protection requires quality, release-safety, E2E, migration validation, staging security, Lighthouse, and build jobs.
- [ ] Live inventory drift has an approved disposition.
- [ ] Migration preflight queries return zero rows in production.
- [ ] Confirm **Immutable release candidate built** and the signed staging aggregate refer to the exact current `main` SHA and explicit run attempts.
- [ ] Obtain a signed approval from an allowlisted actor who is not the deployment actor.
- [ ] Dispatch only `.github/workflows/deploy-production-release.yml` with the full current-main SHA and `DEPLOY_PRODUCTION_RELEASE`.
- [ ] Confirm database, Edge, and Cloudflare jobs consume the same artifact and manifest digests and attempt-qualified evidence.
- [ ] Confirm the captured production rollback deployment ID/SHA still matches canonical production immediately before deploy and differs from the candidate SHA.
- [ ] Confirm rollback authorization is bound to the exact rollback ID/SHA and candidate ID/SHA and refuses a newer or unrelated canonical deployment.
- [ ] Confirm the signed schema-v5 staging aggregate binds N-1 compatibility and catalogue endpoint/route/CWV/query evidence digests.
- [ ] Confirm the signed terminal aggregate reports `release_status=passed` and `rollback_performed=false`.
- [ ] Use direct Cloudflare recovery only when one prior coordinated run attempt proves both database and Edge success; require a fresh approval and never rebuild the candidate.
- [ ] Rollback owner and on-call owner are named.
- [ ] A rollback path is recorded for frontend, edge functions, and database compensating migrations.

## Rollback Notes

- Frontend rollback: use the previous green Cloudflare Pages deployment.
- Edge-function rollback: redeploy the previous reviewed function source from git.
- Database rollback: use a forward-only compensating migration. Do not hand-edit production schema.
- Data repair: use reviewed SQL with a dry-run `select` first and a post-change verification query.
