# RLS Access Matrix

> Last updated: 2026-06-22
> Source: live `pg_policies`/catalog query against project `qvvicunqcrwpioqnvzxf`, live Supabase advisors, local migrations, and the `check:rls-crud-matrix` proof gate.

## Critical User-Owned Tables

| Table | Select | Insert | Update | Delete | Basis | Release note |
| --- | --- | --- | --- | --- | --- | --- |
| `profiles` | Authenticated own profile or platform admin. | Own buyer profile. | Authenticated own permitted participant fields or platform admin. | Not broadly allowed. | `auth.uid()`, private role helper, guarded profile triggers. | Public helper-based profile policies were tightened to authenticated only; public helper RPC execution is revoked for anon/authenticated. |
| `listings` | Active public listings or owner. | Owner only. | Owner only. | Owner only. | `user_id = auth.uid()`. | Frontend mutations should always include `.eq("user_id", user.id)`. |
| `listing_images` | Listing visibility/ownership. | Owner through listing. | Owner through listing. | Owner through listing. | Listing ownership join. | Owner write policies are action-specific; public read is separate. |
| `favorites` | Own favorites. | Own favorites. | Own favorites. | Own favorites. | `user_id = auth.uid()`. | Duplicate `(user_id, listing_id)` index was dropped; unique constraint remains. |
| `projects` | Active projects public; owner/admin authenticated. | Owner only. | Owner only. | Owner only. | `owner_id = auth.uid()`. | Public and owner/admin reads are split to avoid anon helper execution. |
| `project_units` | Active project public view or project owner. | Project owner. | Project owner. | Project owner. | Exists project where `projects.owner_id = auth.uid()`. | Frontend hooks now preflight project ownership before mutation. |
| `project_media` | Active project public view or project owner. | Project owner. | Project owner. | Project owner. | Exists project where `projects.owner_id = auth.uid()`. | Frontend hooks now preflight project ownership before mutation. |
| `project_leads` | Project owner or platform admin only. | Project owner. | Project owner. | Project owner. | Exists project where `projects.owner_id = auth.uid()`. | Public lead select was removed because rows can contain PII. |
| `professionals` | Public active professional data plus owner/admin paths. | Authenticated owner. | Owner. | Owner/admin if policy exists. | `user_id = auth.uid()`. | Keep sensitive profile fields out of anon-readable views. |
| `professional_services` | Active services public. | Authenticated professional owner. | Authenticated professional owner. | Authenticated professional owner. | Exists professional where `professionals.user_id = auth.uid()`. | Batch hooks now reject rows for another `professional_id`; owner write policy is authenticated only. |
| `professional_availability` | Active availability public. | Authenticated professional owner. | Authenticated professional owner. | Authenticated professional owner. | Exists professional where `professionals.user_id = auth.uid()`. | Batch hooks now reject rows for another `professional_id`; owner write policy is authenticated only. |
| `messages` | Sender/receiver participants. | Authenticated sender. | Participant-scoped where allowed. | Participant-scoped where allowed. | Sender/receiver ownership. | Participant update paths are consolidated by sender/participant predicates. |
| `message_attachments` | Message participant. | Message participant. | Message participant. | Message participant. | Message ownership join. | Keep attachment access tied to message participant checks. |
| `auction_alerts` | Own alerts. | Own alerts. | Own alerts. | Own alerts. | `user_id = auth.uid()`. | Missing FK index was added. |
| `open_house_registrations` | Owner/participant scoped. | Participant. | Owner/admin/participant scoped. | Scoped. | Listing/open-house ownership and user identity. | Requester/listing-owner policy overlap is consolidated. |
| `open_house_offers` | Owner/participant scoped. | Participant. | Owner/admin scoped. | Scoped. | Offer/open-house/listing ownership. | Bidder/listing-owner policy overlap is consolidated. |
| `contact_submissions` | Authenticated platform admin. | Public insert with bounded validation checks. | Admin only if policy exists. | Admin only if policy exists. | Public form + admin review. | Always-true insert policy was replaced with validation constraints. |
| `agent_data_inputs` | Agent/admin scoped. | Authenticated agent RPC/policy. | Admin/reviewer scoped. | Admin/reviewer scoped. | Private role helpers and reviewer fields. | Public role-helper RPC execution is revoked for anon/authenticated; RLS uses private helper copies. |

## Storage Buckets

| Bucket | Select | Insert/update/delete | Release note |
| --- | --- | --- | --- |
| `property-images` | Public object read by direct path; broad bucket listing policy removed. | Owner-scoped policies expected. | Public listing was removed; keep direct image URLs non-sensitive. |
| `project-media` | Public object read by direct path; broad bucket listing policy removed. | Project owner-scoped policies expected. | Public listing was removed; keep direct media URLs non-sensitive. |
| `firesale-photos` | Public object read by direct path; broad bucket listing policy removed. | Owner/internal scoped policies expected. | Public listing was removed; confirm no private photos are uploaded. |
| `email-assets` | Public object read by direct path; broad bucket listing policy removed. | Admin/internal scoped policies expected. | Public listing was removed; keep assets non-sensitive. |
| `message-attachments` | Participant scoped. | Participant scoped. | Must not be public. |

## Live Advisor Findings To Track

1. Remaining security advisor warning: leaked password protection is disabled and requires a Supabase Pro plan to enable.
2. Remaining security hardening debt: 0 authenticated SECURITY DEFINER RPC warnings remain. HIBP leaked-password protection is the only remaining security Advisor warning and is Supabase-plan blocked.
3. Fixed: mutable `search_path` warnings, public storage listing policies, broad anon grants for non-public RPCs, open-house capacity/registration browser RPC execution, AdminReports moderation browser RPC execution, admin broadcast browser RPC execution, firesale admin workflow browser RPC execution, firesale interest submit browser RPC execution, public role/quota helper browser RPC execution, legacy onboarding role RPC browser execution, role-switch audit browser RPC execution, role-switch start browser RPC execution, AI quota reservation browser RPC execution, AI quota status browser RPC execution, `pg_net` extension registration in `public`, `project_leads` public select, `contact_submissions` always-true insert, all unindexed-FK findings, and duplicate favorites index.
4. Latest 2026-06-19 read-only verification: live `pg_policies` has zero public-schema role/table/action groups with more than one permissive policy. Supabase Performance Advisor currently returns `unused_index` INFO findings only. `auth_rls_initplan`, multiple-permissive-policy, and unindexed-FK warnings were cleared in the strict release cleanup; unused-index cleanup remains telemetry-gated.

## CRUD Proof Gate

- Run `npm run check:rls-crud-matrix` with `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`/`VITE_SUPABASE_PROJECT_ID` configured to verify live `public` tables.
- Run `npm run capture:rls-crud-matrix -- --out artifacts/rls-crud-matrix.json` during release evidence collection.
- Valid statuses are `covered_by_policy`, `rls_denies_by_default`, and `closed_by_grant`. Any `risk_rls_disabled` status fails.
- Latest live production spot check on 2026-06-22: 73 public tables, 292 CRUD cells, 215 `covered_by_policy`, 52 `rls_denies_by_default`, 25 `closed_by_grant`, and 0 `risk_rls_disabled`.
