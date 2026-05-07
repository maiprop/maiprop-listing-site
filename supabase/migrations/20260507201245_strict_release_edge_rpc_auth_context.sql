-- Service-role-only wrappers for Edge Functions that verify the browser JWT
-- before calling Postgres. The older browser-facing RPCs rely on auth.uid(),
-- which is intentionally absent when called with the service role.

create or replace function public.complete_onboarding_role_for_user(
  p_user_id uuid,
  p_role public.user_role,
  p_participant_type text,
  p_display_name text default null,
  p_city text default null,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  if p_participant_type not in ('buyer','seller','agent','developer','professional') then
    raise exception 'invalid_participant_type';
  end if;

  if p_role::text <> p_participant_type then
    raise exception 'role_participant_mismatch';
  end if;

  if p_role not in (
    'buyer'::public.user_role,
    'seller'::public.user_role,
    'agent'::public.user_role,
    'developer'::public.user_role,
    'professional'::public.user_role
  ) then
    raise exception 'role_not_allowed';
  end if;

  if p_role = 'developer'::public.user_role then
    if nullif(trim(coalesce(p_display_name, '')), '') is null then
      raise exception 'developer_display_name_required';
    end if;
    if nullif(trim(coalesce(p_city, '')), '') is null then
      raise exception 'developer_city_required';
    end if;
  end if;

  if p_role = 'professional'::public.user_role then
    if nullif(trim(coalesce(p_phone, '')), '') is null then
      raise exception 'professional_phone_required';
    end if;
    if not exists (
      select 1 from public.professionals pr where pr.user_id = p_user_id
    ) then
      raise exception 'professional_profile_required';
    end if;
  end if;

  perform set_config('maiprop.onboarding_rpc_active', 'true', true);

  update public.profiles
  set
    role = p_role,
    participant_type = p_participant_type,
    display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
    city = coalesce(nullif(trim(p_city), ''), city),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'profile_update_failed';
  end if;
end;
$$;

revoke all on function public.complete_onboarding_role_for_user(uuid, public.user_role, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_onboarding_role_for_user(uuid, public.user_role, text, text, text, text)
  to service_role;

create or replace function public.grant_platform_admin_by_email_for_caller(
  caller_user_id uuid,
  target_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_uid uuid;
begin
  if caller_user_id is null or not public.has_platform_admin(caller_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select au.id into target_uid
  from auth.users au
  where lower(au.email) = lower(trim(target_email))
  limit 1;

  if target_uid is null then
    raise exception 'target_user_not_found';
  end if;

  if target_uid = caller_user_id then
    return;
  end if;

  -- The profiles guard allows role changes only inside trusted role RPCs.
  perform set_config('maiprop.onboarding_rpc_active', 'true', true);

  update public.profiles
  set role = 'agent'::public.user_role,
      updated_at = now()
  where role = 'admin'::public.user_role;

  update public.profiles
  set role = 'admin'::public.user_role,
      updated_at = now()
  where user_id = target_uid;

  if not found then
    raise exception 'target_profile_not_found';
  end if;
end;
$$;

revoke all on function public.grant_platform_admin_by_email_for_caller(uuid, text)
  from public, anon, authenticated;
grant execute on function public.grant_platform_admin_by_email_for_caller(uuid, text)
  to service_role;
