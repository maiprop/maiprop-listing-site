# Remediation schema lineage and final replay boundary

Updated 27 September 2026, Task 9, from candidate source based on `6fc37d3a146af8a5b39880414d56de71af927233`. **This is a source lineage map, not a final effective-schema export or a statement of deployed state.** Task 9 changes no SQL. All historical migrations remain in place.

The following entries come from inspected routine bodies, explicit grants and accepted local compatibility reports. Filenames alone do not establish which definition is effective. Later migrations can replace a routine, change a policy or ACL, or preserve an existing definition conditionally.

| Surface | Candidate source and affected objects | Preserved boundary / local evidence |
| --- | --- | --- |
| New-build enquiry | `20260923193844_durable_new_build_enquiry_replay.sql`: `private.current_user_owns_listing(uuid)`, `private.preserve_new_build_enquiry_submission()`, `public.submit_new_build_enquiry(...)`, submission fields on `public.new_building_leads` | Task 18 source/captured local compatibility evidence covers enquiry replay. Task 23 preserves the ownership helper's body and adds service-role execution; it is not a replacement helper. Candidate idempotency/lint follow-up still belongs to the pre-D0 prerequisite batch. |
| Open houses and listing visibility | `20260926224929_repair_open_house_listing_boundary.sql`: settings/offer/registration guards, `accept_open_house_offer`, `reopen_open_house_offer_selection`, listing-context RPC and POF status notification helper | Task 23 local permission and lock/race proofs validate child-policy access through the listing boundary. No restoration of raw browser listing grants. Storage SELECT changes are separate below. |
| AI credits | `20260926233914_restore_ai_reservation_spendable_credits.sql`: `public.reserve_ai_quota_for_user(uuid, text)` | Task 24 local ordinary/live/test and contention proofs preserve atomic reservation and existing credit consumption; Task 9 removes only the Edge no-op post-call shim. Reservation remains before paid provider work. |
| Managed listing readers | `20260927003528_restore_managed_listing_readers.sql`: `get_manageable_listing_catalogue()`, `get_manageable_listing_catalogue_page(...)`, `get_manageable_listing_summary()` and supporting indexes | Task 7a source-derived and captured local baselines validate read boundaries; the existing public catalogue view and overload remain. This does not prove live deployment. |
| Project graph and Storage cleanup | `20260927005313_restore_project_storage_capabilities_disabled.sql`: managed upload registry, project graph/attachment capabilities, cleanup jobs/invocations and private rollout control; narrowed Storage SELECT policy helpers | Task 7b local lifecycle/policy/race evidence. Cleanup remains disabled. Writer inventory, delayed provider-delete hazard, old worker drain and control-table default compatibility must remain separate release gates. No scheduler activation follows from capability existence. |
| Role transition compatibility | `20260927013928_restore_role_switch_compatibility_bridge.sql`: compatibility record/begin/complete routines, atomic professional-profile completion, private control and normalization helper | Task 7c local captured/source compatibility, string-contract and contention evidence. Strict and legacy signatures coexist intentionally; strict activation/reconciliation and old handler drain are separate gates. Their overlap is not proof of redundancy. |

## How D0 completes the effective map

The existing local `prepare-schema-trace.mjs` instrumentation records DDL events with a migration identity. Its rollback-only `trace-probe.sql` checked creation, replacement, alteration and deletion of one routine as four ordered events. This proves the trace mechanism, not the full candidate replay.

After the final SQL fixes, regenerate the ordered replay and trace input from the exact source commit. Replay on a fresh explicitly named disposable database with the documented historical default-ACL bootstrap **before** migrations. Do not repair missing grants after replay to make tests pass.

Export ordered creation/replacement/alter/drop events and join surviving identities to the final catalogue, including routine signatures, body hashes, owner/security/search-path/ACL metadata, table policies and triggers. Mark removed objects as removed rather than attributing their last definition to the effective schema. Conditional SQL and objects created inside dynamic statements require actual replay events/catalogue evidence.

Bind that export to the source commit, ordered migration hashes, bootstrap identity and PostgreSQL/extension versions. Compare fresh install and each supported captured upgrade baseline before proposing a squashed baseline. A migration may be superseded at runtime yet remain necessary to build intermediate tables, data or privileges for later migrations.

Until this D0 export exists, a complete final effective-schema map and fresh-install/upgrade equivalence remain pending. The source map above cannot justify deleting migration history, claiming migration coverage, enabling workers, or setting release readiness to true.
