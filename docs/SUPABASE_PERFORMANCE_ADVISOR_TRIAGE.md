# Supabase Performance Advisor Triage

**Last reviewed:** 2026-06-19
**Project:** `qvvicunqcrwpioqnvzxf`
**Gate:** `npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown`

This document is the source-controlled triage record for Supabase Performance
Advisor debt. It separates three things that should not be mixed:

- **Fixed by migration:** safe SQL changes already present in this repository.
- **Accepted for review:** advisor items that need production telemetry before
  another change is safe.
- **Not proven locally:** anything that still requires a live Supabase Advisor
  run with `SUPABASE_ACCESS_TOKEN` and the production project ref.

## Current Repository-Remediated State

The historical advisor baseline was 176 performance lints:

| Category | Historical count | Current treatment |
| --- | ---: | --- |
| `unused_index` | 85 | Strictly redundant indexes were dropped; remaining candidates require telemetry. |
| `multiple_permissive_policies` | 91 | Mechanical/covered RLS consolidations were split across focused migrations. |

Live read-only verification on 2026-06-19:

- Supabase Performance Advisor returned `unused_index` INFO findings only.
- Direct `pg_policies` inspection returned zero public-schema role/table/action
  groups with more than one permissive policy.
- `pg_stat_user_indexes` still shows zero-scan indexes, including protected and
  feature-scaffolding indexes, so index cleanup remains telemetry-gated.

The latest source-controlled remediation chain is:

| Migration | Scope |
| --- | --- |
| `20260510100000_drop_redundant_unused_indexes.sql` | Drops six strictly redundant indexes. |
| `20260707143000_consolidate_public_media_rls.sql` | Splits public-media owner `FOR ALL` policies into write-only owner policies. |
| `20260707150000_reduce_advisor_policy_noise.sql` | Consolidates mechanical owner/admin/public policy overlap and removes stale listing insert bypass. |
| `20260707151000_reduce_remaining_low_risk_policy_noise.sql` | Splits professional service/availability owner policies and consolidates lead insert policy overlap. |
| `20260707152000_consolidate_open_house_advisor_policies.sql` | Consolidates open-house bidder/requester and listing-owner policy overlap. |
| `20260707153000_consolidate_firesale_advisor_policies.sql` | Consolidates Quick Sale interest/feed policies while preserving subscription gates. |
| `20260707159000_fix_staging_advisor_drift.sql` | Reasserts missing index/function-grant hardening observed in staging drift. |
| `20260707168000_cleanup_stale_advisor_indexes.sql` | Adds two useful lookup indexes and drops three left-prefix redundant indexes. |

Regression tests cover the high-risk parts of this chain:

- `src/test/supabaseAdvisorCleanupMigration.test.ts`
- `src/test/supabaseAdvisorPolicyNoiseMigration.test.ts`
- `src/test/supabaseAdvisorLowRiskPolicyNoiseMigration.test.ts`
- `src/test/openHouseAdvisorPolicyConsolidationMigration.test.ts`
- `src/test/firesaleAdvisorPolicyConsolidationMigration.test.ts`
- `src/test/supabaseAdvisorStagingDriftMigration.test.ts`

## Unused Index Policy

`unused_index` means `pg_stat_user_indexes` reports zero scans since stats were
last reset. That is not enough evidence to drop an index.

Do **not** drop indexes from Advisor output alone. A safe drop requires:

1. A fresh Advisor JSON artifact.
2. A matching `pg_stat_user_indexes` snapshot from `npm run capture:supabase-index-stats`.
3. Review of `pg_stat_statements` or slow-query history for the table.
4. Confirmation the index is not primary, unique, exclusion, FK-supporting, or
   supporting an imminent filter/sort path.
5. A migration test proving the exact index is covered by a left-prefix or true
   duplicate index.

The gate already classifies unused-index findings through
`scripts/supabase-advisor-debt.mjs` and reports:

- mapped vs unmapped Advisor findings,
- indexes with scans,
- managed-schema indexes,
- protected constraint/unique indexes,
- public write-path candidates that need query-plan review.

## Multiple Permissive Policy Policy

`multiple_permissive_policies` means PostgreSQL must evaluate more than one
permissive policy for the same role/table/action and OR the result. It is a
performance and maintainability issue, but it can become a security issue if a
consolidation changes RLS semantics.

Safe consolidation rules:

1. Consolidate one table/workflow at a time.
2. Preserve action boundaries: do not replace an INSERT-only rule with broad
   `FOR ALL`.
3. Use cached auth expressions such as `(SELECT auth.uid())`.
4. Add a migration regression test that proves the old policy names are removed
   and the replacement policy keeps the same owner/admin/participant gate.
5. Re-run the live Advisor gate after deployment.

The currently tracked safe consolidations cover public media, project units,
professional services/availability, marketing leads, open-house registration
and offers, Quick Sale interest, and Quick Sale feed access. The 2026-06-19
read-only check found zero duplicate permissive groups in `pg_policies`; keep
the live Advisor gate in place so new policy overlap cannot drift back in.

## Live Verification Procedure

Run this from an operator shell with the Management API token and project ref:

```powershell
$env:SUPABASE_PROJECT_REF = "qvvicunqcrwpioqnvzxf"
$env:SUPABASE_ACCESS_TOKEN = "<management-api-token>"
npm run capture:supabase-index-stats -- --out supabase-index-stats.json
npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown --index-stats supabase-index-stats.json --out supabase-advisor-summary.json
```

Expected release behavior:

- any `ERROR`, `CRITICAL`, or `HIGH` Advisor lint fails the gate;
- any new unclassified WARN/INFO lint fails the gate;
- known WARN/INFO findings must have owner, reason, next action, and review
  cadence in `scripts/supabase-advisor-debt-policy.json`;
- unused-index findings remain review-only until telemetry proves removal is
  safe.

## Remaining ECAS Risk

This work improves Supabase and scalability grades, but it does not replace a
live post-deploy Advisor artifact. ECAS should continue to mark this area below
top grade until `supabase-advisor-summary.json` from production shows:

- zero failing severity lints,
- zero unknown WARN/INFO lints,
- every remaining review item mapped to telemetry or an explicit acceptance,
- no newly introduced broad `FOR ALL` policy overlap on hot tables.
