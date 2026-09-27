# Feature wiring reference — historical claim superseded

The April 2026 claim that every feature was fully functional is not a current acceptance result. Its allowance examples and post-success accounting instructions became obsolete. Use [Platform Architecture](PLATFORM_ARCHITECTURE.md), [the current source checkpoint](superpowers/plans/2026-09-27-remediation-checkpoint.md) and [selected schema lineage](effective-schema-remediation-map.md) instead.

Current candidate AI handlers authenticate and reserve quota through enforceAiQuota before provider work. Database reservation/trigger logic owns consumption. The former recordAiCall compatibility no-op and always-throwing useRecordValuation, useRecordReport and useRecordPriorityAd exports were removed in Task9; usage readers, credit balances and active modules remain. Do not restore those writers from older examples.

Frontend route/plan display is not server permission proof. Local focused evidence, full-source coverage, module/role acceptance and hosted release evidence are different gates. No universal fully-wired or production-ready claim is made here. Historical audit reports and percentages retain their original source/date meaning.
