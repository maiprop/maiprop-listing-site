# UX Proposal: User Types & Flows
**maiProp — v2 Identity Architecture**

---

## 1. Current State Problems

Based on a full audit of `Signup.tsx`, `Onboarding.tsx`, `Navbar.tsx`, `participantConfig.ts`, and `AuthContext.tsx`.

| Problem | Impact |
|---|---|
| "Participant" label means nothing to a real user | High drop-off on signup step 1 |
| Buyer/seller forced to choose upfront — many are both | Artificial friction, wrong mental model |
| Market Professional bucket too broad — lumps agents, developers, service pros | Confusing value proposition for each |
| No explicit Investor path — hidden behind Quick Sale eligibility check | Loses a high-value, monetizable segment |
| Professional full setup (hours, services, video, tax ID) before first dashboard visit | ~6-step wall before any value is delivered |
| `bio: __type:x` is technical debt — a hack on an unrelated field | Fragile, hard to query, can break onboarding |
| Mobile nav has 4 items (Home, Browse, Auctions, Account) — doesn't reflect platform depth | Users on mobile can't discover Open Houses, Quick Sale, Professionals |
| Completion screen sends agents/developers to Pricing first | Wrong call-to-action — value before paywall |
| No progressive profiling — profile gaps aren't prompted post-onboarding | Thin profiles in the directory |

---

## 2. Proposed Identity Model

### Core principle
**Ask about goals, not roles.** Users don't think "I am a participant" — they think "I want to find a flat in Athens."

### Simplified top-level types (3, not 5)

```
┌─────────────────────────────────────────────────────────────────┐
│                        WHO ARE YOU?                             │
│                                                                 │
│  🔍 I'm looking         🏷️ I'm selling        💼 I work in      │
│     for property           / renting out          real estate   │
│                            my property                         │
└─────────────────────────────────────────────────────────────────┘
```

After this single choice, one follow-up question unlocks the right dashboard — no multi-step interrogation.

---

## 3. Detailed Flow Per Type

### Type A — "I'm Looking" (Buyer / Renter)

**Signup flow:**
```
1. Choose "I'm Looking" → email + password (or Google)
2. One question: "What are you looking for?"
   • Buy a property
   • Rent a property
   • Both / exploring
3. Optional: "Are you also interested in auction deals or quick-sale opportunities?" (yes → enables investor features)
4. → Dashboard immediately
```

**What they get by default (Free):**
- Full listings browse (sale + rent)
- Save up to 1 search + 1 alert
- Book 1 viewing/month
- Browse 60 auction listings
- Browse Open Houses, RSVP up to 3/month
- Contact 1 agent/month
- Professional directory (5/category)

**Unlock path to Pro:**
- First time they hit a limit (contact #2, save search #2, auction listing #61) → inline upgrade prompt, not a page redirect

**Investor unlock:**
- If they answered "yes" to auction/quick-sale → Quick Sale™ access card appears in Overview
- No separate investor onboarding — it's a feature toggle, not a separate identity

---

### Type B — "I'm Selling / Renting Out" (Seller / Landlord)

**Signup flow:**
```
1. Choose "I'm Selling" → email + password (or Google)
2. One question: "Tell us about your property"
   • I have a property to sell
   • I have a property to rent out
   • I'm not ready yet, just exploring prices
3. → Dashboard with "Create Listing" as primary CTA in Overview
```

**What they get by default (Free):**
- Create up to 2 listings
- Manage viewing requests
- Messages
- Open House (attend as visitor)
- Browse market for price reference

**Key UX insight:**
Sellers are also buyers. Once they've listed their property, surface "Browse listings to find your next home" — they become a buyer too. The platform should recognise this naturally rather than forcing a re-onboarding.

**Unlock path to Pro:**
- First time they try to create listing #3 → upgrade prompt in the listing creation flow
- Pro unlocks: 5 listings, AI listing assist, analytics, featured badge, Open House hosting tools

---

### Type C — "I Work in Real Estate" → 3 sub-types

This is where the current UX is most broken — one choice leads to three very different experiences.

**Sub-type picker (step 2 only for this path):**
```
┌────────────────┬─────────────────┬─────────────────────────────┐
│  🏠 Agent      │  🏗️ Developer   │  ⚖️ Service Professional    │
│  / Agency      │  / Builder      │                             │
│                │                 │  Lawyer, Architect, Notary, │
│  Licensed to   │  Projects,      │  Engineer, Contractor,      │
│  list & sell   │  pre-sales,     │  Valuer, Financial Advisor, │
│  for clients   │  new builds     │  and 30+ more               │
└────────────────┴─────────────────┴─────────────────────────────┘
```

#### C1 — Agent / Agency

**Signup flow:**
```
1. Choose "Agent / Agency" → email + password
2. Business name + phone (2 fields only)
3. → Dashboard immediately with "Complete your profile" nudge card
```

**What they get by default (Free):**
- Up to 5 listings
- Basic profile in Professionals directory
- Messages
- 3 viewings/month
- maiProp video room (branded)

**Profile completion (progressive, in dashboard):**
A "Your profile is X% complete" card in the Overview nudges them to add:
- License number
- Specialties / working areas
- Profile photo
- Services

**Unlock path to Pro (€149/mo):**
- Hit listing #6 → upgrade prompt
- Try to access Contacts CRM → ProGate overlay
- Try to access Analytics → ProGate overlay
- Pro unlocks: unlimited listings, CRM, analytics, 10 priority ads, auction alerts, private-owner ad alerts

#### C2 — Developer / Builder

**Signup flow:**
```
1. Choose "Developer" → email + password
2. Company name + phone (2 fields only)
3. → Pricing page (developer is Pro-only — explain why immediately)
```

**Key UX change:** Developers don't get a free tier for listings. But rather than blocking them silently, the signup completion screen explains the value clearly with a single upgrade CTA. They get a 7-day free trial.

**What they get (Pro only, €89/mo):**
- Unlimited listings
- Project showcase pages
- Pre-sale management
- Featured placement on New Builds section
- Portfolio tracking
- Lead management

#### C3 — Service Professional

**Signup flow (current is too long — proposed simplification):**
```
Current: pick-pro-type → pro-category → pro-verify → pro-services → pro-availability → pro-video → done (6 steps)

Proposed: pick-category → business name + phone → done (2 steps)
Everything else is done progressively in the dashboard.
```

**Free tier:**
- Directory listing (with basic info)
- Receive incoming leads
- Messages

**Progressive profile (post-signup, in dashboard):**
Dashboard Overview shows a "Complete your profile to get more leads" card with these steps:
1. Add profile photo → +15% lead conversion (shown as incentive)
2. Add service catalog → +25%
3. Add availability hours → +20%
4. Upload license/certificate → +30% (gets Verified badge)
5. Connect video room → +10%

This is a better conversion mechanic than gating signup behind a 6-step form.

**Unlock path to Pro (€49/mo):**
- Try to access Booking calendar → ProGate
- Try to access AI matching → ProGate
- Priority placement in directory (free = basic, Pro = top of results)

---

## 4. Onboarding UX Improvements

### A. Reduce to max 3 screens

| Screen | Content | Time |
|---|---|---|
| 1. Intent | "What are you here to do?" — 3 cards | 5 sec |
| 2. Qualify | 1-2 questions specific to their choice | 10 sec |
| 3. Done | What they get, what's next | 15 sec |

**Total onboarding time: <30 seconds for most users.**

### B. Show value before asking questions

Current "done" screen for agents sends them to Pricing. Proposed:
- "done" screen shows their dashboard preview (screenshot/mockup)
- Primary CTA: "Go to your Dashboard"
- Secondary: "See Pro features" (not primary — they haven't experienced value yet)

### C. Deferred enrichment pattern

Instead of collecting everything upfront, use **nudge cards** in the dashboard Overview:

```
┌─────────────────────────────────────────────────────┐
│  📋  Your profile is 40% complete                   │
│  Add your services to start receiving leads         │
│                              [Complete profile →]   │
└─────────────────────────────────────────────────────┘
```

Show this for 30 days post-signup, then stop — don't nag forever.

### D. Fix the `bio: __type:x` technical debt

Migrate participant type to a dedicated `participant_type` column on the `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS participant_type
  TEXT CHECK (participant_type IN ('buyer','seller','agent','developer','professional'));

-- Backfill from bio
UPDATE profiles SET participant_type = substring(bio from '__type:(.+)$')
WHERE bio LIKE '__type:%';
```

This makes type queries reliable, indexable, and removes the fragile string-prefix check. The `__type:` bio approach can remain as a fallback during migration.

---

## 5. Mobile Navigation Proposal

Current 4 tabs: Home, Browse, Auctions, Account

**Proposed 5 tabs (personalized by user type):**

| Tab | Buyer | Seller | Agent | Professional |
|---|---|---|---|---|
| 1 | 🏠 Home | 🏠 Home | 🏠 Home | 🏠 Home |
| 2 | 🔍 Browse | 📋 My Listings | 📋 Listings | 👥 Directory |
| 3 | 🔥 Deals* | 🔥 Quick Sale | 🔨 Auctions | 📅 Bookings |
| 4 | 📅 Open Houses | 📅 Open Houses | 👥 Leads (Pro) | 💬 Messages |
| 5 | 👤 Account | 👤 Account | 👤 Account | 👤 Account |

*Deals tab = Auctions + Quick Sale in one feed

The 5th tab "Account" opens a bottom sheet with: Dashboard, Messages, Settings, Upgrade to Pro.

---

## 6. Navbar Improvements

**Current problem:** The Navbar shows the same links (Buy, Rent, Auctions, Quick Sale, Open Houses, Professionals) to everyone. The logged-in user's role is not reflected.

**Proposed:**
- Anonymous: Keep current
- Logged-in buyer: Highlight "Saved" in nav, show alert badge count
- Logged-in seller/agent: Show "My Listings" in primary nav (currently buried in dropdown)
- All logged-in: Replace "Get Started" button with user avatar + plan badge (already done, keep)

---

## 7. Conversion Funnel Optimization

### The gate moment — where to show upgrade prompts

| Action | Trigger | Prompt style |
|---|---|---|
| Save 2nd search | On click of "Save search" | Inline modal, not page redirect |
| Contact 2nd agent | On click of "Send message" | Inline modal |
| View auction #61 | List item blurred | Blur overlay with "See all 600+ auctions" |
| Open Analytics tab | Tab click | ProGate overlay |
| Book 2nd viewing | On booking click | Inline modal |
| Create 3rd listing | On form submission | Inline modal before submit |

**Rule:** Never navigate away from the current page to show a paywall. Always use inline modals or ProGate overlays. The user completes the upgrade and returns to exactly where they were.

### Pricing page — auto-select the right tab

Already implemented (`?audience=agent` param). Ensure every upgrade prompt deep-links with the correct audience:
- Buyer upgrade prompt → `/pricing?audience=participant`
- Agent upgrade prompt → `/pricing?audience=agent`
- Professional upgrade → `/pricing?audience=professional`

---

## 8. Summary: What to Change

### High priority (change now)

1. **Rename onboarding labels** — "I'm Looking", "I'm Selling/Renting", "I Work in Real Estate" — replace "Participant" and "Market Professional"
2. **Shorten professional onboarding** — 2 steps max, rest deferred to dashboard
3. **Add "profile completion" nudge card** to Overview for agents and professionals
4. **Developer signup → Pricing** with 7-day trial CTA, not a standard free dashboard
5. **Remove investor as a separate concept** — it's a feature flag on the buyer type
6. **All upgrade prompts must be inline** — never redirect mid-flow

### Medium priority (next sprint)

7. **Mobile nav — personalize by type** (5 tabs, role-aware)
8. **Seller-to-buyer cross-sell** — after listing created, surface browse CTA in dashboard
9. **Progressive profile nudge** — % complete card with specific field prompts

### Technical debt (plan for migration)

10. **Add `participant_type` column** to `profiles` table, backfill from `bio`, update `getParticipantTypeFromProfile()` to use the column

---

## 9. North Star Metric

**Activation = user completes their first meaningful action within 24 hours of signup.**

| Type | Meaningful first action |
|---|---|
| Buyer | Saves a property OR books a viewing |
| Seller | Creates a listing (even draft) |
| Agent | Creates a listing OR completes 50% of profile |
| Professional | Completes 50% of profile |
| Developer | Starts a project |

Track this per type. A drop-off here is the most expensive problem to have — it means acquisition cost was wasted.
