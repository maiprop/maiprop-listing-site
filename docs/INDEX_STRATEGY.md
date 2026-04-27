# Index Strategy

Documents all database indexes, the queries they serve, and the rationale for each.

## Listings Indexes

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_listings_city` | `city` | `buildListingsQuery` filters by city |
| `idx_listings_status` | `status` | Active/inactive filtering |
| `idx_listings_type` | `listing_type` | Sale/rent/auction filter |
| `idx_listings_owner` | `owner_id` | "My Listings" dashboard query |
| `idx_listings_featured` | `(is_featured, priority_placement DESC)` | Homepage featured sort |
| `idx_listings_is_off_market` | `is_off_market` (partial, WHERE true) | Off-market filter |
| `idx_listings_is_pre_sale` | `is_pre_sale` (partial, WHERE true) | Pre-sale filter |
| `idx_listings_project` | `project_id` (partial, WHERE NOT NULL) | Developer project listings |
| `idx_listings_price` | `price` | Price range filters in `buildListingsQuery` |
| `idx_listings_sqm` | `sqm` | Size range filters |
| `idx_listings_bedrooms` | `bedrooms` | Bedroom count filter |
| `idx_listings_property_type` | `property_type` | Property type filter |
| `idx_listings_year_built` | `year_built` | Year built filter |
| `idx_listings_construction_status` | `construction_status` | Condition filter |
| `idx_listings_energy_class` | `energy_class` | Energy class filter |
| `idx_listings_heating_system` | `heating_system` | Heating system filter |
| `idx_listings_city_type_status_price` | `(city, listing_type, status, price)` | Common multi-filter combo |

### Why no further composite indexes

The `(city, listing_type, status, price)` composite covers the highest-traffic query path. Additional composites add diminishing returns at the current data size (154 listings). Monitor slow query logs if dataset grows beyond 10K rows.

## Favorites Indexes

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_favorites_user_listing` | `(user_id, listing_id)` UNIQUE | Prevent duplicate favorites, fast lookup |

## Conversations & Messages

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_conversations_participant_a` | `participant_a` | Inbox queries |
| `idx_conversations_participant_b` | `participant_b` | Inbox queries |
| `idx_messages_conversation` | `conversation_id` | Message thread loading |

## Sync Log

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_sync_log_direction_created` | `(direction, created_at DESC)` | Sync status dashboard |
| `idx_sync_log_entity_type` | `(entity_type, created_at DESC)` | Entity-specific sync queries |
| `idx_sync_log_status` | `(status, created_at DESC)` | Failed sync queries |

## Email Infrastructure

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_email_send_log_created` | `created_at DESC` | Recent email list |
| `idx_email_send_log_recipient` | `recipient_email` | Recipient lookup |
| `idx_email_send_log_message` | `message_id` | Deduplication |
| `idx_email_send_log_message_sent_unique` | `(message_id, sent_at)` UNIQUE | Prevent double sends |
| `idx_suppressed_emails_email` | `email` | Suppression check on send |
| `idx_unsubscribe_tokens_token` | `token` | Token validation |

## Contacts / Deal Checklists / Portfolios

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_contacts_user_id` | `user_id` | User's contacts list |
| `idx_deal_checklists_user_id` | `user_id` | User's checklists |
| `idx_portfolios_user_id` | `user_id` | User's portfolios |
| `idx_projects_owner_id` | `owner_id` | Developer's projects |

## Developer Projects

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_project_units_project` | `project_id` | Units in a project |
| `idx_project_units_status` | `availability_status` | Available units filter |
| `idx_project_media_project` | `project_id` | Media for a project |
| `idx_project_leads_project` | `project_id` | Leads for a project |

## Admin / Platform

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_profiles_single_admin` | `role` UNIQUE (partial, WHERE role = 'admin') | Enforce single platform admin |

## Missing Indexes (Monitored)

These columns are not indexed because the dataset is small or the query pattern doesn't warrant it yet:

- `listings.bathrooms` — rarely filtered alone
- `profiles.subscription_tier` — small table, seq scan is fine
- `auction_alerts.user_id` — low-volume table

Re-evaluate if any of these tables exceed 10K rows.
