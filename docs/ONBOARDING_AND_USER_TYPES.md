# Onboarding process & user types

This document describes how new users sign up, how they choose their role, and what each user type can do.

---

## 1. User types (database roles)

The app has **four** values stored in the database for `profiles.role` (enum `user_role`):

| Role | Description | Set when |
|------|-------------|----------|
| **individual** | Private consumer: buyer, renter, or investor. | Chosen in onboarding (buyer, investor) or default at signup. |
| **seller_landlord** | Private seller or landlord listing their own property. **Eligible for Pro selling addons** (listing visibility, in-app messaging with buyers, etc.). | Chosen in onboarding (Private Seller / Landlord). |
| **agent** | **Real estate agents** (one category by themselves), plus institutional/fund and developer. Licensed or business-side listing for clients. | Chosen in onboarding (Real Estate Agent / Agency, Institutional / Fund, Developer / Builder). |
| **professional** | Service professional: architect, lawyer, notary, contractor, etc. Listed in the Professionals directory. | Chosen in onboarding (Service Professional) and after completing pro verification. |

So there are **4 DB roles** and **7 participant types** in the onboarding UI, grouped into sections: **Private** (buyer, seller, investor), **Real estate agents** (agent only), **Institutional & development** (institutional, developer), **Services** (professional).

---

## 2. When onboarding runs

- **Sign up (email):** User signs up → redirect to `/onboarding`. Profile is created with `role: "individual"` by default; onboarding can change it.
- **Sign up (Google):** OAuth redirect is set to `/onboarding`; after Google auth they land there.
- **Protected routes:** If the user is logged in but their profile has **not** completed onboarding, `ProtectedRoute` redirects them to `/onboarding` (except when they are already on `/onboarding`).

**“Completed onboarding”** is defined in `AuthContext`:  
`profile.bio` must exist and start with `__type:`.  
So any user whose `profiles.bio` is null or doesn’t start with `__type:` is considered “needs onboarding” and is sent to `/onboarding` when they hit a protected route.

---

## 3. Onboarding flow (step by step)

### Step 1: Pick type (“How do you use the market?”)

User sees **7 participant cards** grouped by **section**:

- **Private** — Home Buyer / Renter, Private Seller / Landlord, Private Investor
- **Real estate agents** — Real Estate Agent / Agency (this category is by itself)
- **Institutional & development** — Institutional / Fund, Developer / Builder
- **Services** — Service Professional

Each card has a **participant id**, a **role** written to `profiles.role`, label, tagline, and features.

**Participant list (id → role):**

| Participant id   | Label                         | DB role          | Section                  |
|------------------|-------------------------------|------------------|--------------------------|
| buyer            | Home Buyer / Renter           | individual       | Private                  |
| seller           | Private Seller / Landlord     | **seller_landlord** | Private               |
| investor         | Private Investor              | individual       | Private                  |
| agent            | Real Estate Agent / Agency    | agent            | Real estate agents       |
| institutional    | Institutional / Fund          | agent            | Institutional & development |
| professional     | Service Professional          | professional     | Services                 |
| developer        | Developer / Builder           | agent            | Institutional & development |

- **Non–Service Professional:**  
  User clicks a card that is **not** “Service Professional” → we call `updateProfile({ role })` and set `profiles.bio` to `__type:{id}` (e.g. `__type:buyer`). Then we go to **Done** (step “done”). No further steps.
- **Service Professional:**  
  User clicks “Service Professional” (the one with “Verify” badge) → we go to **Pro category** (multi-step pro flow).

So for non‑pros, onboarding is: **Pick type → Done**.  
For Service Professionals it is: **Pick type → Pro category → Pro verify → Pro services → Pro availability → Pro video → Done**.

---

### Step 2 (Pro only): Pro category (“What’s your discipline?”)

User selects one category, e.g.:

- Architect, Civil Engineer, Lawyer, Notary  
- Electrician, Plumber, Contractor, Property Manager  
- Valuer, Interior Designer, Financial Advisor  

Stored in state only; used in the next step when creating the `professionals` row.

---

### Step 3 (Pro only): Pro verify (Business verification)

User fills:

- Business / Company name (required)
- Tax ID – ΑΦΜ, 9 digits (required)
- Phone (required)
- License / Registration number (optional)

On submit:

- `profiles.role` is set to `"professional"` and `profiles.phone` is updated.
- A row is inserted into `professionals` (user_id, title = business name, category, display_name, city, license_number, bio with `__type:professional` and AFM).
- `profiles.bio` is set to `__type:professional`.
- User proceeds to **Pro services**.

---

### Step 4 (Pro only): Pro services

User selects which **services** they offer (from a catalog per category). For each service they can set:

- Pricing model (e.g. fixed, hourly)
- Rate (e.g. EUR amount)
- Whether the service is available via video consultation

At least one service must be selected. On save, rows are inserted into `professional_services` and we go to **Pro availability**.

---

### Step 5 (Pro only): Pro availability

User sets **weekly availability** (per day: on/off, start time, end time). Default is Mon–Fri 09:00–18:00.  
Saved to `professional_availability`. Then **Pro video**.

---

### Step 6 (Pro only): Pro video

User can optionally add:

- **Meeting link** (e.g. Google Meet, Zoom) for video consultations.
- **Booking notes** (e.g. “Consultations in Greek or English”).

These are stored on the `professionals` row (`video_link`, `calendar_notes`).  
There is also a “Pro Plan” upsell (Coming Soon). On “Finish” or “Skip”, we go to **Done**.

---

### Step 7: Done

- Summary of what’s unlocked for their type (and for pros: “Profile created”, “We’ll review within 24–48h”).
- Buttons: **Go to Dashboard** or **Explore the platform first**.

Onboarding is complete: `bio` starts with `__type:`, so `needsOnboarding` is false and they no longer get redirected to `/onboarding`.

---

## 4. Summary table: participant type → role → flow

| Participant (onboarding label) | profiles.role    | profiles.bio (example) | Steps |
|--------------------------------|------------------|------------------------|--------|
| Home Buyer / Renter             | individual       | __type:buyer           | pick-type → done |
| Private Seller / Landlord       | seller_landlord  | __type:seller          | pick-type → done (eligible for Pro selling addons) |
| Private Investor                | investor         | __type:investor        | pick-type → done |
| Real Estate Agent / Agency      | agent            | __type:agent           | pick-type → done |
| Institutional / Fund            | institutional    | __type:institutional   | pick-type → done |
| Developer / Builder             | developer        | __type:developer       | pick-type → done |
| Service Professional            | professional     | __type:professional    | pick-type → pro-category → … → done |

---

## 5. Dashboard (role-specific)

The **Dashboard** (`/dashboard`) shows different sidebar items and overview content by role:

| Role | Sidebar sections | Overview focus |
|------|------------------|----------------|
| **individual** | Overview, Saved, Saved Searches, Messages, Viewings, Auction Alerts, Profile, Settings | Saved properties & auction alerts; CTA: Browse Listings |
| **seller_landlord** | Overview, My Listings, Saved, Messages, Viewings, Profile, Settings | My listings, views, viewings; CTA: New Listing; Pro upsell card |
| **agent** | Overview, My Listings, Analytics, Saved, Saved Searches, Messages, Viewings, Auction Alerts, Contacts, Projects, Portfolios, Profile, Settings | Listings and leads; CTA: New Listing |
| **investor** | Overview, Deal Flow, Saved, Saved Searches, Messages, Viewings, Auction Alerts, Profile, Settings | Deal pipeline, saved deals; CTA: Investor Dashboard |
| **institutional** | Overview, Deal Flow, My Listings, Analytics, Saved, Saved Searches, Messages, Viewings, Auction Alerts, Contacts, Projects, Portfolios, Profile, Settings | Buy-side + sell-side; listings and deal flow |
| **developer** | Overview, My Listings, Analytics, Saved, Saved Searches, Messages, Viewings, Contacts, Projects, Portfolios, Profile, Settings | Listings and project showcases |
| **admin** | Admin nav (firesale, subscribers, pricing, OS sync) when `role='admin'` | Single admin; only admin can grant admin |
| **professional** | Overview, My Services, Messages, Viewings, Profile, Settings | Services count and upcoming viewings; CTA: My Services |

---

## 6. Where roles are used in the app

- **individual**  
  - Treated as “retailer” for video viewing (free video access in some flows).  
  - Dashboard, listings, favourites, messages (can message Pro professionals).  
  - No professional directory entry.

- **seller_landlord**  
  - **Segmented from other individuals** so they can be **eligible for Pro selling addons** (listing visibility, in-app messaging with buyers, etc.).  
  - Displayed in the UI as “Seller / Landlord”.  
  - Can create and manage their own listings (same as agents for own listings).  
  - Pro page shows a note that Pro unlocks listing visibility and selling addons for them.

- **agent**  
  - **Real estate agents are one category by themselves** in onboarding (section “Real estate agents”).  
  - Can create and manage listings (e.g. Create Listing).  
  - **Platform admin** is separate: only one user has `role='admin'`; only admin can grant admin. See `docs/PARTICIPANT_RIGHTS.md`.  
  - No multi-step “pro” onboarding; no row in `professionals` unless added by another path.

- **investor**  
  - **Buy-side:** Private investors. Deal flow, Investor Dashboard, saved searches, auction alerts.

- **institutional**  
  - **Buy-side + sell-side:** Institutions/funds. Can list properties and access deal flow (Investor Dashboard).

- **developer**  
  - **Sell-side:** Developers/builders. Can create listings and manage project showcases.

- **professional**  
  - Has a row in `professionals` and appears in the **Professionals** directory.  
  - Can have `professional_services` and `professional_availability`.  
  - **Pro subscription** (`subscription_tier === 'pro'` on their profile/subscription) gates: receiving in-app messages, calendar booking, and “Send message” / “Book” on their profile.  
  - Non‑Pro professionals are still listed but with a note that messaging/booking are for Pro professionals.

---

## 7. Signup defaults

- **Email signup** (`Signup.tsx`): `signUp(..., { role: "individual" })`. So new users start as `individual`; onboarding can change them to `seller_landlord`, `agent`, `investor`, `institutional`, `developer`, or `professional` and set `bio` to `__type:<id>`.
- **Google signup:** Redirect to `/onboarding`; no role is set until they complete step 1 (and for pros, step 3 sets `professional`).

---

## 8. Changing type later

The UI says “You can always update it in settings.” In code, the only way to be a **professional** with a directory entry and services/availability is to go through the **Pro** onboarding path (pro-verify creates the `professionals` row). Changing `profiles.role` in settings alone does not create or fill `professionals` / `professional_services` / `professional_availability`.
