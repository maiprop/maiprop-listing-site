begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

lock table public.listings in share mode;
lock table private.os_auction_duplicate_quarantine in share row exclusive mode;

create temp table pg_temp.os_duplicate_terminal_map on commit drop as
select distinct
  quarantine.provider_id,
  quarantine.canonical_listing_id
from private.os_auction_duplicate_quarantine as quarantine
where not exists (
  select 1
  from private.os_auction_duplicate_quarantine as next_link
  where next_link.provider_id = quarantine.provider_id
    and next_link.duplicate_listing_id = quarantine.canonical_listing_id
);

do $$
begin
  if exists (
    select quarantine.provider_id
    from private.os_auction_duplicate_quarantine as quarantine
    left join pg_temp.os_duplicate_terminal_map as terminal
      on terminal.provider_id = quarantine.provider_id
    group by quarantine.provider_id
    having count(distinct terminal.canonical_listing_id) <> 1
  ) then
    raise exception 'os_duplicate_terminal_map_not_unique' using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_temp.os_duplicate_terminal_map as terminal
    join public.listings as canonical
      on canonical.id = terminal.canonical_listing_id
    where private.extract_os_auction_id(canonical.tags)
      is distinct from terminal.provider_id
  ) then
    raise exception 'os_duplicate_terminal_identity_invalid' using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_temp.os_duplicate_terminal_map as terminal
    join private.os_auction_duplicate_quarantine as quarantine
      on quarantine.duplicate_listing_id = terminal.canonical_listing_id
     and quarantine.provider_id = terminal.provider_id
  ) then
    raise exception 'os_duplicate_terminal_is_still_quarantined' using errcode = '23514';
  end if;
end;
$$;

update private.os_auction_duplicate_quarantine as quarantine
set canonical_listing_id = terminal.canonical_listing_id
from pg_temp.os_duplicate_terminal_map as terminal
where terminal.provider_id = quarantine.provider_id
  and quarantine.canonical_listing_id is distinct from terminal.canonical_listing_id;

do $$
begin
  if exists (
    select 1
    from private.os_auction_duplicate_quarantine as quarantine
    join public.listings as canonical
      on canonical.id = quarantine.canonical_listing_id
    left join private.os_auction_invalid_identity_quarantine as invalid_canonical
      on invalid_canonical.listing_id = quarantine.canonical_listing_id
    where private.extract_os_auction_id(quarantine.previous_tags)
        is distinct from quarantine.provider_id
       or private.extract_os_auction_id(
         coalesce(invalid_canonical.previous_tags, canonical.tags)
       ) is distinct from quarantine.provider_id
       or quarantine.duplicate_listing_id = quarantine.canonical_listing_id
  ) then
    raise exception 'os_duplicate_terminal_collapse_incomplete' using errcode = '23514';
  end if;
end;
$$;

commit;
