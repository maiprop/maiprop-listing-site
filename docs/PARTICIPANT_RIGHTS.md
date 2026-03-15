# Participant rights & access control

## Platform admin (single admin)

- **Only one** platform admin exists at any time.
- **Only** the current platform admin can grant admin to another user (via Transfer admin in Investor Dashboard → Subscribers tab).
- Granting admin **transfers** rights: the current admin loses access, the new user gains it.
- Admin capabilities: firesale pipeline, subscriber management, pricing configs, OS sync, view all profiles, grant admin.

## Participant types & fixed rights

Each participant type has **fixed, non-upgradable** rights. Users cannot escalate their own rights by switching participant type.

| Participant   | DB role          | Rights |
|---------------|------------------|--------|
| **buyer**     | individual       | Browse listings, save, viewings, auction alerts |
| **seller**    | seller_landlord  | Create & manage own listings, viewings |
| **investor**  | individual       | Deal flow (with subscription), saved searches, auctions |
| **agent**     | agent            | Listings, analytics, contacts, projects, portfolios, OS sync (business) |
| **developer** | agent            | Listings, analytics, contacts, projects, portfolios — no admin |
| **institutional** | agent        | Deal flow, listings, analytics, contacts, projects, portfolios — no admin |
| **professional** | professional   | Professional directory, services, leads, messages |

## Role escalation rules

- Users **cannot** set their own `role` to `agent` or `professional` via onboarding or settings.
- Only the **platform admin** can assign `agent` or `professional` role (via DB or future admin UI).
- First-time onboarding can set `individual` or `seller_landlord` (buyer, seller, investor).
- Switching participant type clears `bio` and sends user to onboarding; they can only pick types that don't require role escalation.

## Dashboard nav by type

- **buyer**: Overview, Saved, Saved Searches, Messages, Viewings, Auctions, Profile, Settings
- **seller**: Overview, Listings, Saved, Messages, Viewings, Profile, Settings
- **investor**: Overview, Deal Flow, Saved, Saved Searches, Messages, Viewings, Auctions, Profile, Settings
- **agent**: Overview, Listings, Analytics, Saved, Saved Searches, Messages, Viewings, Auctions, Contacts, Projects, Portfolios, Profile, Settings
- **developer**: Same as agent but no Auctions
- **institutional**: Same as agent plus Deal Flow
- **professional**: Overview, Services, Leads, Messages, Viewings, Profile, Settings
- **admin nav** (Admin): Shown **only** when `is_platform_admin = true` (regardless of participant type)
