-- Migration: handle_new_user trigger + backfill missing profiles
--
-- Root cause: there was no trigger to create a profiles row when a new
-- auth.users row is inserted. 14 auth users (including kr@maiprop.co) have
-- no profile row, which causes:
--   - begin_role_switch()  → profile_not_found  → "Your profile record was not found"
--   - check_listing_quota() → returns FALSE     → listing INSERT rejected by RLS
--
-- Fix:
--   1. Drop idx_profiles_single_admin — a partial unique index that enforces
--      at most one admin profile. This constraint is too restrictive: the app
--      supports multiple admins (AdminRoute checks profile.role = 'admin', not
--      a count). It also blocked the backfill since kr@maiprop.co needs admin
--      role but the demo seed account admin@maiprop.demo already holds the slot.
--   2. Create handle_new_user() SECURITY DEFINER trigger function that inserts
--      a minimal profile row (role='buyer') on every new auth user signup.
--   3. Attach it as an AFTER INSERT trigger on auth.users. PostgreSQL fires
--      FOR EACH ROW triggers alphabetically: "on_auth_user_created" (h) fires
--      before "on_auth_user_created_owner" (o), so the owner-elevation trigger
--      finds the row it needs to UPDATE.
--   4. Add UNIQUE constraint on profiles.user_id (needed for ON CONFLICT in
--      the trigger and future upserts).
--   5. Backfill missing profiles for the 14 existing auth users.

-- ── 1. Drop the single-admin constraint ──────────────────────────────────────
DROP INDEX IF EXISTS public.idx_profiles_single_admin;

-- ── 2. Add UNIQUE constraint on profiles.user_id (idempotent) ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_id_key'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END;
$$;

-- ── 3. handle_new_user() trigger function ────────────────────────────────────
-- NOTE: We intentionally omit the `role` column so the INSERT uses the column
-- DEFAULT. At this migration timestamp (20260511) the default is 'individual';
-- migration 20260608 renames that value to 'buyer' and updates the column
-- default accordingly. Hard-coding either label here would break one of the
-- two orderings (CI fresh-apply vs live DB where 'buyer' already exists).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, created_at, updated_at)
  VALUES (NEW.id, now(), now())
  ON CONFLICT (user_id) DO NOTHING;   -- idempotent: skip if row already exists
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates a minimal profiles row (role=column-default) whenever a new row is '
  'inserted into auth.users. Role defaults to ''individual'' pre-20260608, then '
  '''buyer'' after the rename migration. Runs before on_auth_user_created_owner '
  '(alphabetical order) so the owner-elevation trigger finds the row it needs to UPDATE.';

-- ── 4. Attach trigger to auth.users ──────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 5. Backfill missing profiles ─────────────────────────────────────────────
-- Assigns meaningful roles to the owner accounts; all other missing profiles
-- get the available default participant role. Live databases may already have
-- renamed 'individual' to 'buyer', while fresh applies at this point still use
-- 'individual', so the fallback role is resolved from pg_enum at runtime.
-- The ON CONFLICT guard makes this idempotent.
INSERT INTO public.profiles (user_id, role, created_at, updated_at)
SELECT
  u.id,
  (
    CASE
    WHEN LOWER(u.email) IN ('kr@maiprop.co', 'k@maiprop.co') THEN 'admin'::public.user_role
    WHEN LOWER(u.email) = 'kostisrenios@gmail.com'            THEN 'agent'::public.user_role
      ELSE (
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public'
              AND t.typname = 'user_role'
              AND e.enumlabel = 'individual'
          ) THEN 'individual'
          ELSE 'buyer'
        END
      )::public.user_role
    END
  ),
  COALESCE(u.created_at, now()),
  now()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;
