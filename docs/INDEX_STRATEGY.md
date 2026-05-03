# Index Strategy

> Last updated: 2026-04-27

## Design Principles

1. **Index for the query, not the column** — only add indexes that serve real query patterns in `buildListingsQuery` and hooks.
2. **Composite beats multiple singles** — Postgres can only use one index per scan; composite indexes cover multi-column WHERE clauses efficiently.
3. **Partial indexes for sparse booleans** — `WHERE col = true` avoids indexing the majority FALSE rows.
4. **UNIQUE indexes double as constraints** — favorites uniqueness is enforced at the index level.

## Current Indexes

### listings (primary table, ~154 rows)

| Index | Columns | Type | Serves |
|-------|---------|------|--------|
| `idx_listings_city` | `city` | B-tree | City filter in search |
| `idx_listings_status` | `status` | B-tree | Active/sold/pending filter |
| `idx_listings_type` | `listing_type` | B-tree | Sale vs rent filter |
| `idx_listings_owner` | `owner_id` | B-tree | Dashboard "my listings" |
| `idx_listings_price` | `price` | B-tree | Price range filter |
| `idx_listings_sqm` | `sqm` | B-tree | Area range filter |
| `idx_listings_bedrooms` | `bedrooms` | B-tree | Bedroom count filter |
| `idx_listings_property_type` | `property_type` | B-tree | Apartment/house/land filter |
| `idx_listings_year_built` | `year_built` | B-tree | Age filter |
| `idx_listings_construction_status` | `construction_status` | B-tree | New build status |
| `idx_listings_energy_class` | `energy_class` | B-tree | Energy cert filter |
| `idx_listings_heating_system` | `heating_system` | B-tree | Heating type filter |
| `idx_listings_city_type_status_price` | `(city, listing_type, status, price)` | Composite B-tree | Main search page — most common filter combination |
| `idx_listings_featured` | `(is_featured, priority_placement DESC)` | B-tree | Homepage featured section |
| `idx_listings_is_off_market` | `is_off_market` WHERE `true` | Partial B-tree | Off-market filter |
| `idx_listings_is_pre_sale` | `is_pre_sale` WHERE `true` | Partial B-tree | New development filter |
| `idx_listings_project` | `project_id` WHERE NOT NULL | Partial B-tree | Project grouping |

### favorites

| Index | Columns | Type | Serves |
|-------|---------|------|--------|
| `idx_favorites_user_listing` | `(user_id, listing_id)` | UNIQUE B-tree | Lookup + dedup |

### conversations / messages

| Index | Columns | Type | Serves |
|-------|---------|------|--------|
| `idx_conversations_participant_a` | `participant_a` | B-tree | Inbox query |
| `idx_conversations_participant_b` | `participant_b` | B-tree | Inbox query |
| `idx_messages_conversation` | `conversation_id` | B-tree | Chat thread |

### sync_log

| Index | Columns | Type | Serves |
|-------|---------|------|--------|
| `idx_sync_log_direction_created` | `(direction, created_at DESC)` | B-tree | Admin sync dashboard |
| `idx_sync_log_entity_type` | `(entity_type, created_at DESC)` | B-tree | Filter by entity |
| `idx_sync_log_status` | `(status, created_at DESC)` | B-tree | Error investigation |

### contacts / deal_checklists / portfolios

| Index | Columns | Type | Serves |
|-------|---------|------|--------|
| `idx_contacts_user_id` | `user_id` | B-tree | CRM per-user |
| `idx_deal_checklists_user_id` | `user_id` | B-tree | Deal tracking |
| `idx_portfolios_user_id` | `user_id` | B-tree | Portfolio view |
| `idx_projects_owner_id` | `owner_id` | B-tree | Project management |

### email infrastructure

| Index | Columns | Type | Serves |
|-------|---------|------|--------|
| `idx_email_send_log_created` | `created_at DESC` | B-tree | Recent emails |
| `idx_email_send_log_recipient` | `recipient_email` | B-tree | Per-user history |
| `idx_email_send_log_message` | `message_id` | B-tree | Dedup lookup |
| `idx_email_send_log_message_sent_unique` | `(message_id, sent_at)` | UNIQUE | Hard dedup |
| `idx_suppressed_emails_email` | `email` | B-tree | Bounce check |
| `idx_unsubscribe_tokens_token` | `token` | B-tree | Unsubscribe flow |

## Missing Indexes (Candidates)

These are columns used in queries but not yet indexed. At ~154 listings the impact is negligible, but they'll matter at scale:

| Table | Column(s) | Query Pattern | Priority |
|-------|-----------|---------------|----------|
| `listings` | `latitude, longitude` | Map bounds filter (`gte`/`lte`) | P2 — spatial index (`gist`) would be ideal but requires PostGIS |
| `listings` | `created_at` | Sort by newest | P2 — covered by primary key sort for now |
| `auction_listings` | `auction_date` | Upcoming auctions | P2 |
| `open_houses` | `event_date` | Upcoming events | P2 |
| `profiles` | `role` | Admin queries | P2 — low cardinality, full scan is fast |

## When to Add New Indexes

1. Check if `buildListingsQuery` or a hook adds a new `.eq()` / `.gte()` / `.order()` call.
2. If the column is used in a WHERE clause and the table has >1000 rows, add an index.
3. For composite indexes, put the most selective column first (lowest cardinality).
4. Use `EXPLAIN ANALYZE` against the Supabase SQL editor to verify the index is used.
