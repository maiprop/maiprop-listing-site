---
name: testing-supabase
description: Isolated real-role Supabase permission and service contract verification.
---

# Supabase verification

Select an explicit disposable/local or isolated integration target. Confirm project identity and key class without logging credentials. Environment names must have their intended meanings; never assume ANON and SERVICE_ROLE are swapped. Opaque sb_publishable/sb_secret keys are not JWTs and cannot be decoded as such. Only publishable/legacy anon credentials belong in browser configuration. Service/secret credentials stay server-side.

## Permission proof

Use synthetic actors and rows with normal triggers and actual database roles. Exercise owner, unrelated user, admin/service and anonymous cases as relevant. A service-role request does not prove RLS; service bypass and effective table/function grants are separate dimensions.

For allowed UPDATE/DELETE, assert the affected count/returned row and persisted state. For denial, assert no unauthorized change and unchanged protected fields/related rows. HTTP204 or an empty response alone proves neither allowance nor denial. Empty tables can make a permission test vacuous; create scoped synthetic rows first. Check rollback/cleanup and no leaked role/request settings before the next case.

Local managed-schema stubs and reconstructed captured fixtures have limits. Do not add blanket grants after replay to force a pass. Final fresh replay must use its documented historical default-ACL bootstrap before migrations and bind exact source/migration hashes. SQL-language/DDL contracts are distinct from executable PL/pgSQL statement coverage.

## Handler authentication and CORS

verify_jwt=false disables only gateway JWT enforcement. Read the individual handler: signed-in actor verification/quota, cron secret, internal service authorization or signed webhook verification may still apply. For example AI quota reserves against a verified user before provider work; a public website catalogue GET has a different contract. CORS success is not authorization and gateway acceptance is not business completion.

Inspect _shared/cors.ts and the request's Origin. Use the selected isolated origin where possible; production-origin checks are distinct authorized integration work. Cloudflare Access and application visibility are separate; do not disable either to make a test pass.

## Local commands and releases

Read package.json and script definitions before execution. Existing local entry points include runtime:doctor, check:runtime:local, typecheck, check:edge-functions, lint:migrations and lint:migrations:chronology. Use node scripts/project-runtime.mjs -- npm run <name> with installed dependencies. Inspect each test's target guard and run only the relevant scope; do not assume an arbitrary SQL file is rollback-only.

Create additive migrations through the installed Supabase CLI's migration new command after checking its help. Preserve migration history. Production follows docs/PRODUCTION_RELEASE_RUNBOOK.md and its exact-artifact staging/approval/mutation-lease path, including database before Edge before website. Do not submit SQL through ad hoc Management API writes, repair history manually, or deploy functions broadly because a source edit exists. A documentation example is not authorization; prior user scope remains authoritative.

Record exact source, target/version, roles, commands, outcomes and limitations. Current hosted state requires current evidence; historical captures and local passing tests do not establish deployed parity or provider delivery.
