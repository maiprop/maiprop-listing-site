# Task 12 OH UUID canonicalization — bounded P3 fix

## Source and change

Bound to clean tracked BASE `161a08c563523f0b635cce475c3d223c3a85f447` in `C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site`. The helper now validates its event ID before any RPC, lowercases a valid UUID before begin, and uses that canonical value for begin, checkpoint, and returned-ID comparisons. Uppercase UUIDs remain valid at the handler boundary. There is no SQL, migration, retention, rollout, policy, provider retry, or protocol change.

The actual handler's strict fake fetch now submits uppercase `D1200003-0000-4000-8000-00000000000A` while begin and record return and require lowercase `d1200003-0000-4000-8000-00000000000a`. It checks one provider attempt, successful response, accepted replay with no resend or checkpoint, and a malformed helper ID causing zero RPC calls. Existing handler cases and legacy ID-less flow still run in the same fixture.

## Evidence

- Pre-fix RED: `node scripts/run-deno-tests.mjs supabase/functions/oh-registration-notify/admission.test.ts` exited 1. The actual handler's uppercase request returned 500 where 200 was expected at `admission.test.ts:358`.
- Post-fix GREEN: the same focused official runner exited 0, `1 passed | 0 failed` with strict Deno operation/resource sanitizers retained. The retained RED and first GREEN console outputs were observed but not saved as raw log files.
- Final focused pair from `supabase/functions`: `deno test --node-modules-dir=none --cached-only --frozen --allow-env --allow-read --deny-net --import-map=coverage-import-map.json oh-registration-notify/admission.test.ts oh-registration-notify/index.test.ts` exited 0, `7 passed | 0 failed` (one grouped admission test and six existing handler tests). Its raw output is `.tmp/task-12-oh-uuid-20261019/focused-green.log`, SHA-256 `12CBCECE0AE8EF1B22137C6B738BBE0FEE8C5D6FF0DD9CA512A95BD8499989B9`.
- `npm run typecheck:functions` exited 0. `git diff --check` exited 0 (Git printed only LF-to-CRLF checkout warnings).
- An accidental broader `npm run check:edge-functions` was stopped after its output reached the OH handler; it is not claimed as a complete gate. The owned command exited 1 after interruption and has no running session. Its output showed local `deno check` entries only and no download line. No full Edge or database collection was run.
- Raw SHA-256 working-file hashes: `_shared/ohStatusEvent.ts` `F834B66608C89A307C3E04F8A720DF361A1494B21EE6305043B6A1B161B2DFB0`; `oh-registration-notify/admission.test.ts` `49E52684EDBF0E2D7F609CD8BFD1D5B1E062D199A06091F400FE31BAD20DD87E`.

## Limits

No live database, hosted function, provider, inbox, deployment, GitHub, A5, or cutover operation was performed. The focused Deno runner printed a registry download line, but the test's external fetch boundary was replaced with the strict local fake. The accepted database batch 35 was not rerun. This patch addresses only the retained uppercase spelling P3; the original admission and deployment boundaries remain as recorded in the independent review.
