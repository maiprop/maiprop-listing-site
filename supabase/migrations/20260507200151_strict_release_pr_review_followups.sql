-- Follow-up fixes from PR review and fresh migration validation.

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

do $$
begin
  if to_regprocedure('private.has_role(uuid, public.app_role)') is not null then
    create or replace function private.has_role(_user_id uuid, _role public.app_role)
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $function$
      select exists (
        select 1
        from public.user_roles
        where user_id = _user_id
          and role::text = _role::text
      )
    $function$;

    grant execute on function private.has_role(uuid, public.app_role) to authenticated;
  end if;
end;
$$;

drop policy if exists sync_log_insert on public.sync_log;
create policy sync_log_insert
on public.sync_log
for insert
to public
with check ((select auth.role()) = 'service_role'::text);
