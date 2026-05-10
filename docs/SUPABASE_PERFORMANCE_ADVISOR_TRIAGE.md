# Supabase Performance Advisor Triage

**Last reviewed:** 2026-05-10
**Project:** `qvvicunqcrwpioqnvzxf` (production)
**Phase:** 2.4 of the codebase assessment

The Supabase performance advisor reports 176 lints on this project, in two
categories:

| Category | Count |
| --- | --- |
| `unused_index` | 85 |
| `multiple_permissive_policies` | 91 |

This document walks through each, decides what to action, and explains the
reasoning so future reviewers can verify (or revisit) the call.

---

## Unused indexes (85)

`unused_index` means: PostgreSQL's `pg_stat_user_indexes` reports zero scans
on the index since stats were last reset. The Supabase advisor therefore
flags it as a candidate for removal.

But "currently unused" is not the same as "safe to drop":

- **Foreign-key supporting indexes** (FK targets) are needed to keep cascade
  deletes, joins, and `WHERE fk = ?` lookups fast. Without them, the moment
  a row in the parent table is deleted (or a feature starts joining on the
  FK), Postgres falls back to a sequential scan. The official PostgreSQL
  guidance is to keep an index on every FK column unless you are positive
  the column is never filtered, joined, or used by a cascade.
- **Filter-column indexes** (e.g. on `listings.property_type`) exist to
  support filters that the product *will* use even if current traffic
  patterns don't exercise them. Dropping them would cause regressions the
  next time a feature ships that hits those filters.
- **Strictly redundant indexes** are duplicates: another index on the same
  table already covers the same (or a superset of) columns under the same
  predicate. Postgres can always answer the same queries from the wider
  index. Dropping these is free.

### Triage outcome

We categorised the 85 unused indexes into four buckets:

| Bucket | Count | Action |
| --- | --- | --- |
| Strictly redundant | 6 | **Drop** in `20260510100000_drop_redundant_unused_indexes.sql` |
| Strictly redundant but DROP deferred | 1 | Keep until a future migration (see note below) |
| FK-supporting | 27 | Keep (needed for cascade deletes / joins) |
| Filter / feature scaffolding | 48 | Keep (will be hit when feature traffic ramps) |
| BRIN partial-redundant | 3 | Keep (intentional BRIN choice for time-series scans) |
| **Total** | **85** | |

### One redundant index could not be dropped in this migration

`idx_firesale_interest_deal_id` is also strictly redundant (covered by
`firesale_interest_deal_id_investor_id_key`, the unique-constraint backing
index on `(deal_id, investor_id)`). It belongs in the drop list.

However, the table `firesale_interest` and this index are first created in
`supabase/migrations/20260529000000_firesale_interest_queue.sql`, while
this migration is timestamped `20260510100000`. On a fresh-DB replay
(CI's migration replay, new dev environments, staging rebuilds), Postgres
runs migrations in chronological order — so a `DROP INDEX IF EXISTS` at
this timestamp would execute before the index ever gets created, ending up
as a no-op. Production would then diverge from fresh-replay state.

The migration chronology linter (`scripts/check-migration-idempotency.mjs`)
rejects new timestamps later than `now + 1 day`, so we cannot simply pick
a timestamp after `20260529000000` until the calendar clock catches up to
late-May 2026. The DROP for this index will be added in a follow-up
migration when the chronology lint allows a timestamp later than
`20260529000000`.

Until then, the live unused-index count drops from 85 to **79** (85 − 6),
not to 78 as originally targeted.

### Strictly redundant (dropped in this migration)

These 6 indexes are covered by another index on the same table that already
indexes the same column as its leading column under the same WHERE predicate
(or no predicate). Postgres uses the wider index for any query the narrow
one could answer.

| Dropped | Covering index | Reason |
| --- | --- | --- |
| `idx_conversations_participant_a` | `idx_conversations_participant_a_last (participant_a, last_message_at)` | Wider btree, leading column matches. |
| `idx_conversations_participant_b` | `idx_conversations_participant_b_last (participant_b, last_message_at)` | Wider btree, leading column matches. |
| `idx_deal_checklists_user_id` | `deal_checklists_user_id_entity_type_entity_id_key (user_id, entity_type, entity_id)` | Unique-constraint backing index, leading column matches. |
| `idx_unsubscribe_tokens_token` | `email_unsubscribe_tokens_token_key (token)` | Pure duplicate of the unique-constraint index. |
| `idx_listing_view_events_listing` | `idx_listing_view_events_listing_date (listing_id, viewed_at DESC)` | Wider btree, leading column matches. |
| `idx_suppressed_emails_email` | `suppressed_emails_email_key (email)` | Pure duplicate of the unique-constraint index. |

### Strictly redundant but DROP deferred

| Index | Covering index | Reason for deferral |
| --- | --- | --- |
| `idx_firesale_interest_deal_id` | `firesale_interest_deal_id_investor_id_key (deal_id, investor_id)` | Index is created in migration `20260529000000`, later than this migration's `20260510100000` timestamp. See note above. |

### FK-supporting (kept)

These 27 indexes back foreign-key columns. The advisor flags them because
nothing has triggered a query yet, but they are part of the schema's
correctness story — without them, future cascade deletes or admin-panel
JOINs would degrade silently.

```
idx_agent_data_input_bans_banned_by         idx_messages_receiver_id
idx_agent_data_inputs_reviewed_by           idx_messages_sender_id
idx_auction_alerts_user_id                  idx_open_house_offers_decided_by
idx_contact_tasks_contact                   idx_open_house_registrations_approved_by
idx_contacts_listing_id                     idx_professional_reviews_reviewer_id
idx_email_send_log_message                  idx_project_units_listing_id
idx_email_send_log_recipient                idx_project_views_viewer_id
idx_favorites_listing_id                    idx_usage_ai_valuations_listing_id
idx_firesale_requests_user_id               idx_usage_priority_ads_listing_id
idx_leads_professional_id                   idx_usage_property_reports_listing_id
idx_leads_project_id                        idx_viewings_owner_id
idx_listing_view_events_viewer_id
idx_marketing_leads_listing_id
idx_marketing_leads_owner_id
idx_marketing_leads_professional_id
idx_marketing_leads_project_id
```

### Filter / feature scaffolding (kept)

These 48 indexes support filter or sort columns the product expects to hit
once the relevant feature sees production traffic (e.g. `idx_listings_sqm`
once square-metre filters are added to the search UI, or
`idx_invitation_requests_status` once admins triage backlogs in bulk).
Dropping them would create predictable performance regressions on those
features the moment they start seeing usage.

The full list (48 entries) is enumerated in
`scripts/perf-advisor-triage.json` (generated on demand from the live advisor
JSON dump) — not duplicated here to keep this doc readable.

### BRIN partial-redundant (kept)

```
idx_listing_view_events_brin   (BRIN on viewed_at)
idx_listings_created_brin      (BRIN on created_at)
idx_messages_brin              (BRIN on created_at)
```

These three are BRIN indexes deliberately chosen for very large append-only
time-series tables. They overlap with the corresponding btree indexes, but
the trade-off is intentional: BRIN keeps storage near-zero on hot tables and
is good for range scans during analytics jobs, while the btree handles
selective lookups. Dropping them would marginally hurt analytics queries
and isn't a clear win — keeping for now.

### How to revisit

If, after a quarter or two, traffic patterns prove that a "kept" index is
still genuinely unused, the same triage can be re-run by re-fetching the
advisor JSON:

```sh
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/advisors/performance \
  > advisor.json
```

…and the same Python categorisation script can be re-run against
`pg_stat_user_indexes` snapshot to identify any that are now truly safe to
drop.

---

## Multiple permissive policies (91)

`multiple_permissive_policies` means: for some `(role, table, action)`
combination, two or more `PERMISSIVE` RLS policies are defined. Postgres
must evaluate every permissive policy and `OR` them together, so duplicate
policies multiply per-row evaluation cost — not a security issue, but a
real (small) performance issue on hot tables.

The 91 lints reduce to **21 distinct tables**. Most are double-counted
across roles (`anon`, `authenticated`, `authenticator`,
`supabase_privileged_role`, `dashboard_user`, `cli_login_postgres`) — the
underlying logical issue is the same handful of overlapping policy pairs
per table.

The current state is the result of a lot of incremental policy-tuning over
time (`20260604120000_performance_rls_initplan_and_dedup.sql` already
consolidated dozens of these). The remaining cases all fall into one of
three patterns:

### Pattern A — separate "owner" + "bidder/participant" policies

Example: `open_house_offers` has `oh_offers_bidder` (FOR ALL on
`bidder_id = auth.uid()`) plus `oh_offers_owner_select` and
`oh_offers_owner_update` (FOR SELECT/UPDATE on the listing's owner).

These can be consolidated into a single FOR SELECT and a single FOR UPDATE
policy whose USING clause is `bidder OR owner`, leaving FOR INSERT and FOR
DELETE on the bidder-only `oh_offers_bidder` policy. Same logical gate, one
policy per action instead of two.

This pattern applies to: `open_house_offers`, `open_house_registrations`,
`messages`, `firesale_interest`, `firesale_request_invites`, `viewings`,
`conversations`, `conversation_participants`.

### Pattern B — "user can SELECT own" + "platform admin can SELECT all"

Example: `agent_data_input_bans`, `ai_usage_limits`, `articles`,
`listing_images`, `marketing_leads`, `project_media`, `project_units`,
`role_switch_history`, `leads`, `open_house_settings`.

The two policies could be merged into a single policy whose USING clause is
`<owner predicate> OR is_platform_admin(profile)`, but doing so requires
verifying that no admin tool relies on the admin policy being separately
nameable (e.g. for `pg_audit` filtering or for a future split where the
admin path needs different `WITH CHECK`).

### Pattern C — INSERT/DELETE quirks on `firesale_interest`

`firesale_interest` has two FOR INSERT and two FOR UPDATE policies that are
near-duplicates with subtly different WITH CHECK clauses. Consolidating
requires careful diff against the actual production state.

### Triage outcome

**No policy consolidation in this PR.** Each of the three patterns above
needs:

1. A row-level diff test confirming the consolidated policy admits the same
   rows as the union of the existing policies.
2. A regression test in `idor.mutations.test.ts` covering the affected
   table.
3. Sign-off that the renamed policy doesn't break any audit/logging
   assumptions downstream.

That work is sized as a multi-day effort, not a Phase 2.4 deliverable. We
instead capture the rationale here so a future hand-off has the analysis
ready.

If/when the consolidation is done, the recommended order (by impact /
clarity) is:

1. Pattern A on `open_house_offers` (12 lints) — has the cleanest
   bidder/owner split.
2. Pattern A on `open_house_registrations` (12 lints) — same shape as #1.
3. Pattern B on `marketing_leads` (10 lints) — second-highest impact.
4. The remaining 18 tables in descending lint count.

---

## Migration applied

This PR ships exactly one migration:

- `supabase/migrations/20260510100000_drop_redundant_unused_indexes.sql`

It drops 6 of the 7 strictly-redundant indexes identified during triage
(the 7th — `idx_firesale_interest_deal_id` — is deferred for the chronology
reason explained above). No policy changes, no FK-index changes, no
feature-scaffolding-index changes.

After this migration, the unused-index advisor count should drop from 85 to
**79** (85 − 6).

The `multiple_permissive_policies` count is unchanged at **91** by design;
those are tracked here for future work.
