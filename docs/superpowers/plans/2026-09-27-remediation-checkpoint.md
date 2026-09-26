# Remediation checkpoint — 27 September 2026

This checkpoint corrects the 24 September conversational status summary. It does not replace the adopted remediation plan or authorize a deployment.

## Corrected status

- Task1 release dependency mapping already exists in `docs/release-capabilities/2026-09-21-remediation.json`. Final release reconciliation and readiness are still pending.
- Task2 Professionals was implemented and independently reviewed locally in commits `6a10b070` and `823f8095`. Staging/API/browser promotion evidence remains a separate gate; it is incorrect to call its implementation wholly pending.
- Task22 RSVP quota implementation exists at `e67777e4`. The initial 20-check suite's Pro/non-buyer assertions only made a first call, and its duplicate assertion only counted a previously created row. Those checks did not establish the behavior their labels claimed.
- Task25 viewing policy implementation exists at `faa7e13a`; its 24-check SQL suite is partial proof. Full actual-role privacy/transition/owner-quota cases, local HTTP compatibility, cached upgrade compatibility, comprehensive drift rollback tests and independent review remain outstanding. The previous report overstated transition coverage and must not be read as acceptance.
- Task23 Open Houses child policies, listing context, offers and admin proof-of-funds interfaces remain pending. Task24 purchased-credit quota correction also remains pending. Task25 was implemented ahead of that adopted order; its outstanding checks must stay visible.
- The final performance, cleanup, release reconciliation, module acceptance and fresh coverage gates remain open. No current coverage percentage or production success follows from focused local tests.

## RSVP evidence added in this checkpoint

The amended suite now executes four distinct registrations each for Pro and non-buyer accounts and verifies four stored rows. It replays a free buyer registration at quota with altered contact details and compares the entire returned receipt with the stored original. It checks the retained subject-based RPC at quota, a cancelled-registration replay and an incorrect raw-insert marker.

The local pre-migration run completed all 30 assertions with six failures caused by the known over-admission. One earlier attempt had a test dollar-quote syntax error and is retained separately. Applying only the committed Task22 migration produced 30/30 passing assertions.

The two-session race now has statement, lock and idle transaction timeouts. It verifies the contender's actual PostgreSQL advisory-lock wait and blocking session, beyond merely observing a busy connection. The race passed 7/7, immediately followed by the ordinary suite at 30/30 in the same backend. A separate cleanup query returned zero synthetic users, profiles, listings, registrations and race sessions.

Raw outputs remain in the local `.superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-22-20260927-*` files. These are local PostgreSQL source-fixture results; existing missing managed default grants remain a limitation. No application grants or runtime code were changed to make tests pass.

The actual registration Edge handler now has an explicit quota-envelope regression case (8/8 tests passed). The registration hook also verifies that this envelope produces one request, the existing monthly-limit error, no success toast and no returned registration (46/46 tests passed). Runtime behavior was not changed.

The final expanded ordinary suite passed 40/40, adding a separate legacy buyer's three successful admissions and fourth rejection, venue capacity, full/required/invalid slots and persisted-row counts after denial. The earlier 7/7 plus 30/30 composition run remains separate historical evidence; it is not relabelled as a 40-check run.

Task22 fresh-source/release reconciliation and independent review remain open. This checkpoint closes specific evidence gaps, not whole-project acceptance.
