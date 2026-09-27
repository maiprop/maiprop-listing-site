# On-call and incident response

Updated 27 September 2026 from repository source. Monitoring ownership, alert routing, intervals and current hosted configuration must be verified in the incident environment; this document does not assert that historical example monitors or contact aliases are active.

## First response

Record affected module/action, UTC time, environment, release marker, request/correlation IDs and safe error codes. Distinguish browser, website API, Supabase service, database and external-provider failures. Inspect existing logs and status dashboards before making changes; never include tokens, recipient content or financial documents in incident notes.

Use existing organizational escalation contacts. Severity follows user impact: complete outage, major workflow failure, degraded feature, or cosmetic defect. Confirm the applicable response target with the on-call owner rather than relying on an unverified roster.

## Source-informed checks

| Incident | Checks and recovery boundary |
| --- | --- |
| Website/catalogue unavailable | Compare website release marker, Pages response and /api/public route outcome; inspect upstream errors and cache/publication state. Local browser loading does not establish backend health. |
| Authentication or permissions | Check target/session validity, authority, ownership and effective grants/RLS. Do not seed/reset accounts, widen grants or bypass Cloudflare Access as a diagnostic remedy. |
| Payment/checkout | Inspect exact checkout receipt, durable subscription state and signed webhook processing. A return URL or entitlement refresh alone is not settlement. Replay can mutate billing; use the existing reviewed recovery procedure and authorized scope. |
| AI | Separate authentication/quota denial, configuration failure and provider response. Nullable/unavailable evidence is supported; do not fabricate estimates or bypass quotas. Inspect current breaker configuration rather than assuming fixed timings. |
| Scheduled auction poll | Read import/update/item-error/page_fetch_failures and completion/persistence fields. Some imports can succeed despite partial processing or failed sync_log persistence. HTTP200/cron completion alone does not prove the intended batch completed. |
| Email | Identify direct producer versus queue consumer; distinguish rejected, unknown, provider-accepted and checkpointed results. A503 can follow an accepted email whose checkpoint failed. Investigate before retrying to avoid duplicates. |

## Email and scheduler limits

Saved-search/followup handlers now check conditional persistence and scheduler business outcomes in candidate source. This is not durable exactly-once dispatch. A pg_net request ID/response is transport evidence; SQL cron invocation completion is not business completion. Provider HTTP acceptance is not delivery; inspect delivery/bounce events separately. Queue usage/current schedules remain unverified; there is no documented five-second retry guarantee. See [ADR-004](adr/004-pgmq-email-queue.md).

## Changes and release

Use the [Production Release Runbook](PRODUCTION_RELEASE_RUNBOOK.md) for selected exact-artifact staging, approval, lease and production mutation. Do not use dashboard redeploys, ad hoc Management API migration writes, manual migration-history repair or broad function deployment as incident shortcuts. Existing user authorization and incident scope still govern actions; documentation itself grants none.

After recovery, record observed cause, affected versions, corrective change, verification and unresolved limits in a dated incident report under docs/incidents. Do not label local fixtures as hosted proof.
