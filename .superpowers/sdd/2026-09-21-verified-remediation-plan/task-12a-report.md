# Task 12a — truthful email checkpoints and scheduled outcomes

Base: `7b7e96a974bdb306ed4f763cf3ce033dd88eb385`.
Implementation: `f85ac80b0018fdfb8361e5b95c8fec89ed188379`.
Scope: four existing handlers and their adjacent actual-handler tests only; this is T12a, not completion of all Task12.

## Result and compatibility

- Saved alerts authenticate before revealing missing sender configuration. Missing BREVO key returns503 with zero processing/sends and no checkpoint. Successful HTTP acceptance alone increments emailsSent; separate checkpointsPersisted tracks database completion. A conditional returning UPDATE matches id, user, original JSONB filters, consent=true, and original UUID[] snapshot. SQL NULL and empty UUID[] are distinct (is.null versus eq.{}); only exactly one returned row completes the checkpoint. Concurrent edits/deletion and resolved query/auth/update errors return truthful failure, with no recipient/body/provider response in cron output. Matching, snapshot selection, templates and sender remain unchanged. No historical checkpoint reset.
- Followup preserves admin/internal-service authorization, CRM manual and preview paths, fixed sender and legacy brevo key alias. HTTP acceptance survives empty/malformed optional JSON; existing email_id now uses messageId/message_id or null. Marketing UPDATE matches original nullable step and original new status when transitioning contacted; explicit older manual template sends remain allowed, while stored progression is max(original, requested). CRM retains timestamp/status update but now checks persistence. Accepted send plus failed persistence returns503 with provider_accepted=true/persistence_complete=false and never sends again within that operation. Transport exceptions return unknown with nullable acceptance; HTTP rejection is distinct.
- Scheduler retains day1/8/29 selection and child request contract. Old success:true child responses without added fields remain compatible. Explicit acceptance/persistence fields must be true if present; malformed/empty, preview, business false, unknown/null, partial outcome and non-2xx results are failed. A partial batch returns503/success:false and exact existing processed/succeeded/failed counts, no retry. Logs no longer print recipient names or raw child errors.
- Auction poller checks resolved sync_log.error and catches rejection, returning a persistence flag. Imported/updated/errors remain visible when logging fails. Full-pool, empty and missing-credential deliberate skips are recorded. Primary errors remain primary when log persistence also fails, with exactly one logging attempt. Catalogue pool/date tags, cap, sampling, trim/prune, canonical guard, filters and authorization are unchanged. Existing count/trim handling is now inside the terminal error boundary so authenticated processing failures can also be recorded. Item errors no longer yield full success; accepted catalogue work is separate from log completion.

No shared parser/framework needed. Runtime files remain in coverage. No SQL migration, queue activation/retirement, new scheduler, provider call, deployment, GitHub action, install, full coverage collection or broad build occurred. Hooks were bypassed for these scoped commits as authorized due the known ignored-artifact repository lint issue; explicit changed-file lint passed.

## Evidence and exact commands

All Deno commands run from `supabase/functions`, one process per test file. Actual source handlers and frozen actual SDK are imported; fake fetch intercepts synthetic provider/DB/AI requests. Unexpected fake routes throw and Deno denies all network. No SDK substitution/import-map change.

```powershell
& 'C:/Users/K R/.deno/bin/deno.exe' test --node-modules-dir=none --cached-only --frozen --allow-env --allow-read --deny-net --import-map=coverage-import-map.json <suite>
```

Accepted scoped results:

| Suite | Passing cases | Evidence file under this SDD directory |
|---|---:|---|
| send-saved-search-alerts/index.test.ts |18|task-12a-final2-send-saved-search-alerts.txt|
| followup-lead/index.test.ts |20|task-12a-final2-followup-lead.txt|
| scheduled-followups/index.test.ts |18|task-12a-final2-scheduled-followups.txt|
| poll-os-auctions/index.test.ts |23|task-12a-final2-poll-os-auctions.txt|
| poll-os-auctions/request.test.ts |7|task-12a-final-poll-os-auctions-request.test.ts.txt|

**86 distinct scoped cases passed.** Deno type checks passed with no no-check option. After self-review made absent CAS predicates behave as unrestricted updates in the stateful fake, only the affected concurrent tests were repeated: saved3 and followup2 pass (`task-12a-final-cas-*.txt`, command above plus `--filter concurrent`). No production change followed the full runs. Tests assert one sink attempt, persisted row contents, response counts, request predicates and non-overwrite of changed state. Actual SDK converts rejected fetches into resolved error results; poll tests exercise both HTTP DB errors and rejected transport through that real SDK path. They do not falsely claim a forced custom query thenable rejection bypassing SDK behavior.

RED before runtime changes used command above plus these filters:
- saved alerts `--filter 'missing sender'`:1 failure, expected503 versus actual200. Historical original missing-key persistence/suppression proof remains intact in saved-alert-reproduction-results.json. This new regression subsequently proves no write/send while missing, then the same match eligible after fake configuration.
- followup `--filter 'followup preserves HTTP'`:4 failures (documented ID absent, alias absent, empty/malformed accepted body treated as failure).
- scheduler `--filter 'scheduler does not'`:7 failures for false business outcomes, malformed/empty/preview/non-2xx classification/aggregate truthfulness.
- poll `--filter 'poll preserves imported'`:2 failures, expected503 versus actual200 after resolved/rejected outcome logging transport.
Retained `task-12a-red2-*.txt`. Self-review added three scheduler explicit-unknown/malformed-field cases; all3 failed before stricter classification, then passed in final18 (`task-12a-red3-scheduler-explicit-unknown.txt`).

Diagnostics retained separately: initial command used repository cwd with function-relative paths and failed before executing tests; first typed fixtures hit RequestInit overload inference errors and were corrected before behavioral RED (`task-12a-red-*.txt`). Two editing-script syntax failures applied no changes. First complete poll run passed16/failed6 with429 because sequential synthetic cron cases exhausted the unchanged three-per-minute limiter; this was test isolation, not a catalogue regression. Each added scenario now advances a deterministic Date.now window by60001ms and restores it in finally; no sleeps, limiter bypass or production limiter/key change. Corrected poll22 passed, then final added ordinary-success assertion gave23. `task-12a-green1-*.txt` and `task-12a-green2-poll.txt` retained.

Scoped lint from repository root (exit0, no diagnostics), last run after all edits:

```powershell
node scripts/project-runtime.mjs -- node node_modules/eslint/bin/eslint.js --no-ignore supabase/functions/send-saved-search-alerts/index.ts supabase/functions/send-saved-search-alerts/index.test.ts supabase/functions/followup-lead/index.ts supabase/functions/followup-lead/index.test.ts supabase/functions/scheduled-followups/index.ts supabase/functions/scheduled-followups/index.test.ts supabase/functions/poll-os-auctions/index.ts supabase/functions/poll-os-auctions/index.test.ts
git diff --check
```

Patch check exit0; only repository LF-to-CRLF normalization notices. Deno fmt applied selected files; unrelated pre-handler/source and existing test prefix formatting was restored to base to limit review noise. Existing templates untouched.

## Version and documentation verification

Frozen Edge deno.lock resolves both @supabase/supabase-js@2 and @2.57.2 to2.57.2 and postgrest-js1.21.3. Actual cached1.21.3 source confirms eq interpolates values (no object JSON conversion), is handles NULL and chained select requests return=representation. Frontend2.108.2 was not used as proof of Edge SDK behavior.

Public official references checked27September: [changelog](https://supabase.com/changelog.md), [update](https://supabase.com/docs/reference/javascript/update), [eq](https://supabase.com/docs/reference/javascript/eq), [is](https://supabase.com/docs/reference/javascript/is), [return data after modification](https://supabase.com/docs/reference/javascript/db-modifiers-select). Latest PG minor breaking notice does not change these frozen conditional PATCH contracts. No SDK upgrade selected. Controller's retained email design supplies official Brevo messageId contract; no authenticated provider verification performed.

## Self-review and remaining limits

Reviewed all eight scoped files and the whitespace-insensitive runtime diff. Source matching and scheduling rules are unchanged; no current listing/card functionality removed. Stateful fakes apply emitted filters to independently mutated rows; missing filters are unrestricted, so the fixture cannot itself silently protect a missing concurrency guard. Exact affected rows are required for email checkpoints; full-pool skip logs do not substitute for pool state.

These fixes make completion reporting truthful; **they do not solve the provider/database atomicity gap**. Accepted email followed by a failed checkpoint can be sent again on a later invocation. Concurrent invocations can still both send before their competing checkpoint; timeout acceptance stays unknown.503 is not evidence that a retry is safe. There is no automatic retry added here, durable email admission, frozen operation ledger, pg_net dispatch correlation, provider deduplication/inbox-delivery proof, or hosted video/TURN proof. Those remain T12b/release work. No claim of >=80% coverage or full-project completion is made.

## Fix round1 — sampled-page completion (independent Important finding)

Fix base `5fbb46f6d0039bd4730f26629cf09937d4312a5d`; implementation `40842cf52fa6cd178b15139df913840cf76a55e7`.
Read full task-12a-independent-review-20260927.md. Confirmed the allSettled sampling path discarded selected-page failures while the terminal result inspected only item-write errors. Added separate page_fetch_failures count for rejected selected extra-page fetches. Successful imports remain preserved; item errors/imported/updated semantics and the selection/cap/prune algorithm remain unchanged. Any page failure makes the completed processing partial: HTTP503, ok:false/import_complete:false/outcome:partial, checked log status error with safe counts. Both the empty available-results branch and ordinary import branch apply the same rule. Any later primary failure retains observed page failures alongside existing counts. No retries or scheduling changes.

Tracked actual-handler regressions reuse the existing stateful SDK/fetch fixture and isolated clock. Selected pages are exactly0/3/5/7, requested once each:
- Mixed page results: pages0/3 succeed,5/7 fail; imports1 under unchanged size1 selection, total2, item errors0, page failures2, partial response and one error log.
- Empty available results: first page empty but totalElements10,3/5/7 fail; imports0/total0, page failures3, partial response and one error log rather than an inferred successful empty catalogue.
- All four pages succeed: total4, imports1 under unchanged selection, item errors0, page failures0, HTTP200/full completion and one success log.

RED before runtime repair:3 failed (two expected503 versus actual200; control missing new zero count), retained task-12a-fix1-red.txt. GREEN after repair: full affected poll suite26 passed/0 failed, retained task-12a-fix1-green.txt. Exact commands from repository root:

```powershell
& 'C:/Users/K R/.deno/bin/deno.exe' test --node-modules-dir=none --cached-only --frozen --allow-env --allow-read --deny-net --config=supabase/functions/deno.json --import-map=supabase/functions/coverage-import-map.json --filter 'sampled poll truthfully' supabase/functions/poll-os-auctions/index.test.ts
& 'C:/Users/K R/.deno/bin/deno.exe' test --node-modules-dir=none --cached-only --frozen --allow-env --allow-read --deny-net --config=supabase/functions/deno.json --import-map=supabase/functions/coverage-import-map.json supabase/functions/poll-os-auctions/index.test.ts
node scripts/project-runtime.mjs -- node node_modules/eslint/bin/eslint.js --no-ignore supabase/functions/poll-os-auctions/index.ts supabase/functions/poll-os-auctions/index.test.ts
git diff --check
```

Deno type checks and scoped lint passed; patch check exit0 with repository newline notices only. Request parser did not change, so its prior7 passing tests were not repeated; unchanged email/scheduler suites were not repeated. Self-reviewed exact two-file diff. Independent probe/artifacts preserved. No schema, provider/hosted/GitHub, install, retry, scheduler, or T12b work performed. Original T12b/release/coverage limitations remain.
