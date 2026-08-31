-- Reconcile the production recovery replay of
-- 20260728115960_prepare_batched_os_duplicate_quarantine.sql.
--
-- The original migration already performs the state transition for new
-- databases. Production replayed that exact migration after historical
-- migration bookkeeping had drifted, so this later version is intentionally
-- an assertion-only history marker.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.listings in share mode;
lock table private.os_auction_duplicate_quarantine in share mode;
lock table public.listing_promotion_allocations in share mode;

do $$
begin
  if to_regclass('private.os_auction_duplicate_quarantine') is null then
    raise exception 'os_auction_duplicate_quarantine_missing'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from private.os_auction_duplicate_quarantine as quarantine
    join public.listings as duplicate
      on duplicate.id = quarantine.duplicate_listing_id
    where duplicate.owner_id is not null
       or private.extract_os_auction_id(quarantine.previous_tags)
          is distinct from quarantine.provider_id
  ) then
    raise exception 'os_auction_duplicate_recovery_state_invalid'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from private.os_auction_duplicate_quarantine as quarantine
    join public.listing_promotion_allocations as allocation
      on allocation.listing_id = quarantine.duplicate_listing_id
    where allocation.ends_at > statement_timestamp()
      and allocation.revoked_at is null
  ) then
    raise exception 'os_auction_duplicate_has_active_promotion'
      using errcode = '23514';
  end if;
end;
$$;

commit;
