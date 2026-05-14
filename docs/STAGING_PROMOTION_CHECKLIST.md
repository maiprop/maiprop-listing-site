# Staging Promotion Checklist

Use this checklist before promoting the hardening branch to staging or production.
The default posture is local-only: no live app, database, or edge-function changes
until every gate below has an owner and a recorded result.

## Live-Safety Boundary

- [ ] Confirm the branch under review is not `main`.
- [ ] Confirm no command in the review used `supabase db push`, `supabase functions deploy`, Cloudflare deploy, or production data mutation.
- [ ] Confirm `deploy-edge-functions.yml` is manual-only and dry-run by default.
- [ ] Confirm destructive E2E tests require `E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS=true` and an allowlisted non-production project ref.
- [ ] Record the live Supabase project ref and the staging Supabase project ref.

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
- [ ] Rollback owner and on-call owner are named.
- [ ] A rollback path is recorded for frontend, edge functions, and database compensating migrations.

## Rollback Notes

- Frontend rollback: use the previous green Cloudflare Pages deployment.
- Edge-function rollback: redeploy the previous reviewed function source from git.
- Database rollback: use a forward-only compensating migration. Do not hand-edit production schema.
- Data repair: use reviewed SQL with a dry-run `select` first and a post-change verification query.
