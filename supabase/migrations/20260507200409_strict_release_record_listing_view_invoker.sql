-- Keep the listing view RPC least-privileged in live environments where the
-- prior follow-up migration has already been applied.
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
  update public.listings
  set views_count = coalesce(views_count, 0) + 1
  where id = p_listing_id;

  insert into public.listing_view_events (listing_id, viewer_id)
  values (p_listing_id, p_viewer_id);
end;
$$;

revoke all on function public.record_listing_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_listing_view(uuid, uuid) to service_role;
