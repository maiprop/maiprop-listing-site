-- Critical security-advisor fixes:
-- 1. Keep RLS helper functions available for policy evaluation from a non-exposed schema.
-- 2. Remove direct REST/RPC EXECUTE access to privileged public SECURITY DEFINER helpers.
-- 3. Recreate pg_net so the extension registration is not in public.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.authoritative_role(_user_id uuid)
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where user_id = _user_id
  limit 1
$$;

create or replace function private.authoritative_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select private.authoritative_role((select auth.uid()))
$$;

create or replace function private.get_my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where user_id = (select auth.uid())
  limit 1
$$;

create or replace function private.has_platform_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.authoritative_role(_user_id) = 'admin'::public.user_role
$$;

create or replace function private.has_role(_user_id uuid, _role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.authoritative_role(_user_id) = _role
$$;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role::text = _role::text
  )
$$;

create or replace function private.has_buy_side_role(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = _user_id
      and role in ('investor'::public.user_role, 'institutional'::public.user_role)
  )
$$;

create or replace function private.has_sell_side_role(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = _user_id
      and role in (
        'agent'::public.user_role,
        'institutional'::public.user_role,
        'developer'::public.user_role
      )
  )
$$;

create or replace function private.check_listing_quota()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_pro boolean;
  v_limit integer;
  v_count integer;
begin
  select
    coalesce(p.role, 'buyer'),
    (
      p.subscription_product_id is not null
      and exists (
        select 1
        from public.pro_product_ids pp
        where pp.product_id = p.subscription_product_id
      )
    )
    or coalesce(p.force_pro_access, false)
  into v_role, v_is_pro
  from public.profiles p
  where p.user_id = (select auth.uid());

  if not found then
    return false;
  end if;

  v_limit := public.get_listing_limit(v_role, v_is_pro);

  if v_limit is null then
    return true;
  end if;

  select count(*)
  into v_count
  from public.listings
  where owner_id = (select auth.uid())
    and (status is null or status != 'deleted');

  return v_count < v_limit;
end;
$$;

revoke all on function private.authoritative_role(uuid) from public, anon;
revoke all on function private.authoritative_role() from public, anon;
revoke all on function private.get_my_role() from public, anon;
revoke all on function private.has_platform_admin(uuid) from public, anon;
revoke all on function private.has_role(uuid, public.user_role) from public, anon;
revoke all on function private.has_role(uuid, public.app_role) from public, anon;
revoke all on function private.has_buy_side_role(uuid) from public, anon;
revoke all on function private.has_sell_side_role(uuid) from public, anon;
revoke all on function private.check_listing_quota() from public, anon;

grant execute on function private.authoritative_role(uuid) to authenticated;
grant execute on function private.authoritative_role() to authenticated;
grant execute on function private.get_my_role() to authenticated;
grant execute on function private.has_platform_admin(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.user_role) to authenticated;
grant execute on function private.has_role(uuid, public.app_role) to authenticated;
grant execute on function private.has_buy_side_role(uuid) to authenticated;
grant execute on function private.has_sell_side_role(uuid) to authenticated;
grant execute on function private.check_listing_quota() to authenticated;

do $$
declare
  policy_record record;
  using_expr text;
  check_expr text;
  policy_roles text;
  policy_command text;
  policy_kind text;
begin
  for policy_record in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      p.polname as policy_name,
      p.polcmd,
      p.polpermissive,
      p.polroles,
      pg_get_expr(p.polqual, p.polrelid) as using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage')
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%has_platform_admin(%'
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%has_role(%'
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%check_listing_quota(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%has_platform_admin(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%has_role(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%check_listing_quota(%'
      )
  loop
    select string_agg(
      case
        when role_oid = 0 then 'public'
        else quote_ident(pg_get_userbyid(role_oid))
      end,
      ', '
    )
    into policy_roles
    from unnest(policy_record.polroles) as role_oid;

    policy_command := case policy_record.polcmd
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      when '*' then 'ALL'
    end;

    policy_kind := case
      when policy_record.polpermissive then 'PERMISSIVE'
      else 'RESTRICTIVE'
    end;

    using_expr := policy_record.using_expr;
    check_expr := policy_record.check_expr;

    if using_expr is not null then
      using_expr := replace(using_expr, 'private.has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      using_expr := replace(using_expr, 'public.has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      using_expr := replace(using_expr, 'has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      using_expr := replace(using_expr, '__PRIVATE_HAS_PLATFORM_ADMIN__(', 'private.has_platform_admin(');

      using_expr := replace(using_expr, 'private.has_role(', '__PRIVATE_HAS_ROLE__(');
      using_expr := replace(using_expr, 'public.has_role(', '__PRIVATE_HAS_ROLE__(');
      using_expr := replace(using_expr, 'has_role(', '__PRIVATE_HAS_ROLE__(');
      using_expr := replace(using_expr, '__PRIVATE_HAS_ROLE__(', 'private.has_role(');

      using_expr := replace(using_expr, 'private.check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      using_expr := replace(using_expr, 'public.check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      using_expr := replace(using_expr, 'check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      using_expr := replace(using_expr, '__PRIVATE_CHECK_LISTING_QUOTA__(', 'private.check_listing_quota(');
    end if;

    if check_expr is not null then
      check_expr := replace(check_expr, 'private.has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      check_expr := replace(check_expr, 'public.has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      check_expr := replace(check_expr, 'has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      check_expr := replace(check_expr, '__PRIVATE_HAS_PLATFORM_ADMIN__(', 'private.has_platform_admin(');

      check_expr := replace(check_expr, 'private.has_role(', '__PRIVATE_HAS_ROLE__(');
      check_expr := replace(check_expr, 'public.has_role(', '__PRIVATE_HAS_ROLE__(');
      check_expr := replace(check_expr, 'has_role(', '__PRIVATE_HAS_ROLE__(');
      check_expr := replace(check_expr, '__PRIVATE_HAS_ROLE__(', 'private.has_role(');

      check_expr := replace(check_expr, 'private.check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      check_expr := replace(check_expr, 'public.check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      check_expr := replace(check_expr, 'check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      check_expr := replace(check_expr, '__PRIVATE_CHECK_LISTING_QUOTA__(', 'private.check_listing_quota(');
    end if;

    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );

    execute format(
      'create policy %I on %I.%I as %s for %s to %s%s%s',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name,
      policy_kind,
      policy_command,
      policy_roles,
      case when using_expr is null then '' else ' using (' || using_expr || ')' end,
      case when check_expr is null then '' else ' with check (' || check_expr || ')' end
    );
  end loop;
end;
$$;

revoke execute on function public.authoritative_role() from anon, authenticated, public;
revoke execute on function public.authoritative_role(uuid) from anon, authenticated, public;
revoke execute on function public.check_listing_quota() from anon, authenticated, public;
revoke execute on function public.get_my_role() from anon, authenticated, public;
revoke execute on function public.has_buy_side_role(uuid) from anon, authenticated, public;
revoke execute on function public.has_platform_admin(uuid) from anon, authenticated, public;
revoke execute on function public.has_role(uuid, public.app_role) from anon, authenticated, public;
revoke execute on function public.has_role(uuid, public.user_role) from anon, authenticated, public;
revoke execute on function public.has_sell_side_role(uuid) from anon, authenticated, public;

alter default privileges in schema public
  revoke execute on functions from anon, authenticated, public;

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_net'
      and extnamespace = 'public'::regnamespace
  ) then
    -- Fail fast if downstream environments have pg_net dependents that need
    -- a custom migration path. The live queue was verified empty before this
    -- release migration was applied.
    drop extension pg_net;
    create extension pg_net schema extensions;
  elsif not exists (
    select 1
    from pg_extension
    where extname = 'pg_net'
  ) then
    create extension pg_net schema extensions;
  end if;
end;
$$;
