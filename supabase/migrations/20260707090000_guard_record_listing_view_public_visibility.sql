-- Only public listings should mutate listing analytics. The Edge Function is
-- unauthenticated, so the RPC must be the durable enforcement point.
create or replace function public.record_listing_view(
  p_listing_id uuid,
  p_viewer_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  with visible_listing as (
    update public.listings
    set views_count = coalesce(views_count, 0) + 1
    where id = p_listing_id
      and status = 'active'::public.listing_status
      and coalesce(is_off_market, false) = false
    returning id
  )
  insert into public.listing_view_events (listing_id, viewer_id)
  select id, p_viewer_id
  from visible_listing;
end;
$$;

revoke all on function public.record_listing_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_listing_view(uuid, uuid) to service_role;
