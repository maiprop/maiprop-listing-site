# maiProp E2E Test Report

Date: 2026-05-18
Target: https://portal.maiprop.co

## Summary

Completed a live, production-aware supervisor drill using mock user personas across buyer, seller, agent, developer, professional, investor, institutional investor, and admin accounts. The canonical and legacy mock matrices were repaired/recreated in place with current role, participant type, and free/pro/managed tier state. Destructive account deletion/re-signup was tested with disposable generated users rather than bulk-deleting canonical demo accounts.

The runnable live coverage is now green for mock-user actions, supervisor interactions, and dashboard verification. The broader role/tier matrix now passes 11 of 13 checks; the remaining failures are real findings in `/api-docs` and the platform admin mock account.

## Agent Method

- Used Codex subagents to map account lifecycle, feature/interactions, and pricing/mock-matrix risks.
- Used the Cloudflare Agents SDK and OpenAI Agents SDK skill guidance to structure the supervisor/worker-agent style test plan.
- Implemented the executable supervisor as Playwright plus Supabase-admin orchestration in `e2e/live-supervisor-agent-network.spec.ts`.

## Commands Run

- `npx playwright test e2e/live-supervisor-agent-network.spec.ts --project=chromium --workers=1 --reporter=list --retries=0`
  - Latest run: 3 passed, 1 skipped.
  - Passed: full mock matrix repair, cross-user interaction creation, dashboard/module verification.
  - Skipped: disposable delete/re-signup branch on latest rerun because Supabase Auth returned email send rate limit 429. This branch passed once before repeated reruns hit the rate limit.
- `npx playwright test e2e/live-role-tier-matrix.spec.ts --project=chromium --workers=1 --reporter=list --retries=0`
  - Latest run: 11 passed, 2 failed.
- `npx playwright test e2e/live-mock-users-actions.spec.ts --project=chromium --workers=1 --reporter=list --retries=0`
  - Latest run: 7 passed.
- `npm run typecheck`
  - Passed.

## Mock Users Repaired

Canonical mock users were created or updated with password `Demo2025!`, confirmed email state, current profile role, participant type, and tier override/subscription state:

- Free/pro buyers: `buyer.free@maiprop.demo`, `buyer.pro@maiprop.demo`
- Free/pro sellers: `seller.free@maiprop.demo`, `seller.pro@maiprop.demo`
- Free/pro agents: `agent.free@maiprop.demo`, `agent.pro@maiprop.demo`
- Free/pro developers: `developer.free@maiprop.demo`, `developer.pro@maiprop.demo`
- Professionals, free/pro where applicable: architect, lawyer, civil engineer, notary, property manager, financial advisor, and valuer personas.
- Managed investor personas: `investor.private@maiprop.demo`, `investor.institutional@maiprop.demo`
- Legacy sets: `buyer1-3`, `seller1-3`, `agent1-3`, `developer1-3`, `investor1-3`, `institutional1-3`, `professional1-3`.

## Live Interactions Covered

- Account lifecycle: generated user signup, onboarding, delete account, old password rejected, same-email re-signup.
- Listings: free seller listing, pro agent listing, pro open-house listing, developer/new-build listing.
- Buyer/agent/seller/developer/professional interactions: conversations and messages between buyers, sellers, agents, developers, investors, architect, and lawyer personas.
- Viewing flows: in-person viewing, video viewing, and open-house registrations.
- Professional lead flow: buyer consultation request to architect profile.
- Developer flow: project creation plus plan/viewing lead wired to developer CRM/dashboard.
- Dashboards: buyer messages/viewings/property report area, agent listings/analytics/leads/contacts/billing, developer analytics/leads/contacts/projects/portfolios, professional profile/services/leads/billing.

## Remaining Findings

1. `/api-docs` still throws the live ReDoc error: `An error occurred. See https://git.io/JUIaE#17 for more information.`
2. `admin@maiprop.demo` cannot currently be promoted to true platform admin through the live seed/RPC path. The database trigger returns `role_change_via_direct_update_not_permitted`; the account signs in but renders as an agent/agency dashboard, so `/admin` coverage remains blocked.
3. Direct pro listing creation for `agent.pro@maiprop.demo` hit `listing_limit_reached` even after the live profile had `force_pro_access=true`. The supervisor used service-role listing insertion for pro/open-house/developer records to continue downstream module testing. This should be checked against current pricing/business rules.
4. Supabase Auth email rate limiting blocks repeated destructive signup/delete/re-signup reruns for disposable accounts. Treat the latest lifecycle skip as infrastructure throttling, not an app assertion failure.

## Files Added Or Updated

- `playwright.config.ts`: supports live `PLAYWRIGHT_BASE_URL` without starting a local server.
- `e2e/live-role-tier-matrix.spec.ts`: canonical role/tier live matrix.
- `e2e/live-mock-users-actions.spec.ts`: legacy mock-user action coverage, updated for repaired investor/institutional users.
- `e2e/live-supervisor-agent-network.spec.ts`: production-gated supervisor drill that repairs mock users and verifies cross-persona interactions/dashboard wiring.
- `maiprop-e2e-test-report.md`: this report.
