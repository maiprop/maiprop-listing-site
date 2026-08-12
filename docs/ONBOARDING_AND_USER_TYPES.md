# Onboarding and participant types

This document describes the current onboarding and account-type switching contracts.
It is an implementation reference, not a substitute for the database policies and
Edge Functions that enforce the rules.

## Source of truth

The `profiles.role` enum contains these values:

- `buyer`
- `seller`
- `agent`
- `developer`
- `professional`
- `investor`
- `institutional`
- `admin`

The public self-service onboarding UI currently offers five destination types:
`buyer`, `seller`, `agent`, `developer`, and `professional`.
`investor` and `institutional` remain database roles but are not selectable in
the current self-service onboarding flow. `admin` is platform-controlled and can
never be obtained through onboarding or account-type switching.

For a non-admin profile, onboarding is complete only when:

1. `profiles.role` is explicitly set.
2. `profiles.participant_type` is explicitly set to the same value.
3. `profiles.role_switch_in_progress_at` is null.

`profileNeedsOnboarding` in `src/contexts/AuthContext.tsx` implements that rule.
Legacy markers in `profiles.bio` may still be read for old display fallbacks, but
they are not authoritative evidence that onboarding completed.

## Initial onboarding

Email and OAuth sign-up routes send the user to `/onboarding`. A default role on a
new profile does not complete onboarding because `profiles.participant_type` is
still missing.

The first screen presents:

| UI choice | Stored role and participant type | Next step |
| --- | --- | --- |
| Home Buyer / Renter | `buyer` | Done |
| Private Seller / Landlord | `seller` | Done |
| Real Estate Agent / Agency | `agent` | Done |
| Developer / Builder | `developer` | Developer company setup, then Done |
| Service Professional | `professional` | Category, verification, services, availability, video, then Done |

The application does not write role fields directly from the browser. It invokes
the authenticated `complete-onboarding-role` Edge Function, which validates the
role/participant pair and calls the database completion RPC. The database owns the
aligned role update and rejects unsupported or mismatched pairs.

### Buyer, seller, and agent

After the user confirms the type, `complete-onboarding-role` writes the aligned
`profiles.role` and `profiles.participant_type` pair. The UI refreshes the
profile only after the server confirms the mutation, then displays Done.

### Developer

Developer setup requires company name, city, and development type. The same
`complete-onboarding-role` boundary writes the aligned developer identity and
the supported profile fields. The browser does not gain a direct role-write path.

### Service professional

The professional flow collects:

1. Professional category.
2. Business name, phone, AFM, and optional license/registration number.
3. At least one service and its pricing model.
4. Weekly availability.
5. Optional video meeting link and booking notes.

`complete-onboarding-role` creates or returns the owned professional profile as
part of the authoritative role completion. Later steps use
`save-professional-onboarding` for owned services, availability, and video
settings. Client-provided user ownership is not trusted.

## Changing participant type

Settings does not update `profiles.role` directly. The switch is a durable,
audited transaction:

1. The browser creates and persists a unique role-switch operation ID.
2. `begin-role-switch` runs in validate-only mode to check business blockers
   before any billing or profile mutation.
3. `log-role-switch` establishes the audit record and reconciles the current
   Stripe subscription state.
4. `begin-role-switch` runs with that audit ID, clears the participant identity,
   sets `profiles.role_switch_in_progress_at`, and pauses or archives workflows
   that cannot remain active during the switch.
5. The user returns to `/onboarding` and selects the destination type.
6. Where billing confirmation is required, `log-role-switch` records and
   reconciles the destination before completion.
7. `complete-onboarding-role` finalizes the aligned role and participant type,
   clears the role-switch sentinel, and restores destination-owned rows
   idempotently.

If any required audit or billing step fails, the switch remains incomplete and the
UI must not pretend that the new role is active. Active Quick Sale commitments,
accepted Open House offers, and other server-defined blockers are enforced before
the destructive phase.

## Dashboard and entitlement behavior

The dashboard derives its navigation from the explicit participant type. Access to
paid or sensitive capabilities is still enforced server-side; changing a visible
dashboard layout is not an entitlement grant.

| Type | Primary dashboard focus |
| --- | --- |
| `buyer` | Saved properties, searches, viewings, messages, and auction alerts |
| `seller` | Owned listings, viewing requests, messages, and listing performance |
| `agent` | Client listings, contacts, leads, analytics, projects, and portfolios |
| `developer` | Projects, new-build inventory, inquiries, and analytics |
| `professional` | Service catalog, consultations, messages, availability, and profile |
| `investor` | Deal flow, portfolio activity, searches, and auction alerts |
| `institutional` | Institutional deal flow, portfolio, listings, contacts, and analytics |
| `admin` | Platform administration routes guarded by server-side admin authority |

Plan access comes from the authoritative subscription and entitlement contracts,
not from a client role string. A professional directory row, Stripe subscription,
or admin grant is never created merely by changing local UI state.

## Failure and recovery rules

- Do not clear the role-switch operation until the authoritative completion call
  succeeds.
- Do not treat a default signup role as user intent.
- Do not accept a role/participant mismatch.
- Do not let a failed Stripe reconciliation advance the switch.
- Do not let client code write role, participant type, switch sentinel, or audit
  identifiers directly.
- Repeated requests must remain idempotent for the same operation ID.

## Verification

The minimum regression surface is:

- `src/test/authContext.onboarding.test.ts`
- `src/test/AuthContext.test.tsx`
- `src/test/OnboardingPage.test.tsx`
- `src/test/onboardingHelpers.test.ts`
- `src/test/DashboardUtilityTabs.behavior.test.tsx`
- `supabase/functions/complete-onboarding-role/index.test.ts`
- `supabase/functions/begin-role-switch/index.test.ts`
- `supabase/functions/log-role-switch/index.test.ts`
- `src/test/onboardingDocumentation.test.ts`

Any change to the role enum, self-service destinations, completion RPC, Stripe
reconciliation, or role-switch lifecycle must update this document and those
contract tests together.
