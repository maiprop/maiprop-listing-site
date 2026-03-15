# Participant rights & access control

## Platform admin (single admin)

- **Only one** platform admin exists at any time.
- **Only** the current platform admin can grant admin to another user (via Admin Dashboard → Subscribers tab → Transfer admin).
- Granting admin **transfers** rights: the current admin loses access, the new user gains it.
- Admin capabilities: firesale pipeline, subscriber management, pricing configs, OS sync, view all profiles, grant admin.
- **Admin features live only at `/admin`.** Dashboard and Investor Dashboard no longer show admin sections.

## Participant types & fixed rights

Each participant type has **fixed, non-upgradable** rights. Users cannot escalate their own rights by switching participant type. **Switching participant type** (Settings → Switch Participant Type) changes dashboard layout and feature visibility, but does **not** grant admin; only `is_platform_admin` does.

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

- Users **cannot** set their own `role` to `agent` (platform admin only).
- Users **can** upgrade to `professional` or `seller_landlord` via onboarding; charges apply per plan.
- First-time onboarding can set `individual`, `seller_landlord`, or `professional`.
- **Switch Participant Type** (Settings): Changes how the dashboard is organised; does not grant admin. Users can switch between buyer, seller, investor, agent, etc. within allowed plans.
- Switching participant type clears `bio` and sends user to onboarding; within-role switches allowed.

## Dashboard nav by type

- **buyer**: Overview, Saved, Saved Searches, Messages, Viewings, Auctions, Profile, Settings
- **seller**: Overview, Listings, Saved, Messages, Viewings, Profile, Settings
- **investor**: Overview, Deal Flow, Saved, Saved Searches, Messages, Viewings, Auctions, Profile, Settings
- **agent**: Overview, Listings, Analytics, Saved, Saved Searches, Messages, Viewings, Auctions, Contacts, Projects, Portfolios, Profile, Settings
- **developer**: Same as agent but no Auctions
- **institutional**: Same as agent plus Deal Flow
- **professional**: Overview, Services, Leads, Messages, Viewings, Profile, Settings

## Admin access

- **Admin Dashboard** at `/admin`: Firesale pipeline, Subscribers, OS sync, link to Pricing. Accessible only when `is_platform_admin = true`.
- Navbar dropdown shows "Admin" link when `is_platform_admin = true`.
