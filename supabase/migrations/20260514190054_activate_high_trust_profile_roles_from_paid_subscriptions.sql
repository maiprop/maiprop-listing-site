-- Paid high-trust subscriptions activate the matching profile role.
--
-- Admin invitation approval intentionally creates pending_payment only. Once a
-- payment-confirmation path marks the investor subscription active/trial, the
-- profile must stop looking like an incomplete buyer onboarding row; otherwise
-- ProtectedRoute redirects eligible investors back to /onboarding.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS participant_type TEXT
  CHECK (participant_type IN ('buyer','seller','agent','developer','professional','investor','institutional'));

CREATE OR REPLACE FUNCTION public.sync_profile_role_from_investor_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF NEW.status NOT IN ('active', 'trial') THEN
    RETURN NEW;
  END IF;

  v_role := CASE NEW.tier
    WHEN 'institutional' THEN 'institutional'::public.user_role
    WHEN 'developer' THEN 'developer'::public.user_role
    ELSE 'investor'::public.user_role
  END;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role_trg'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role_trg';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role';
  END IF;

  UPDATE public.profiles
  SET
    role = v_role,
    participant_type = v_role::text,
    role_switch_in_progress_at = NULL,
    updated_at = now()
  WHERE user_id = NEW.user_id
    AND (
      role IS DISTINCT FROM v_role
      OR participant_type IS DISTINCT FROM v_role::text
      OR role_switch_in_progress_at IS NOT NULL
    );

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role_trg'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_guard_admin_and_role_trg'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_guard_admin_and_role'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role';
    END IF;
    RAISE;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_role_from_investor_subscription
  ON public.investor_subscriptions;
CREATE TRIGGER trg_sync_profile_role_from_investor_subscription
  AFTER INSERT OR UPDATE OF tier, status ON public.investor_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_role_from_investor_subscription();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role_trg'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role_trg';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role';
  END IF;

  UPDATE public.profiles p
  SET
    role = CASE s.tier
      WHEN 'institutional' THEN 'institutional'::public.user_role
      WHEN 'developer' THEN 'developer'::public.user_role
      ELSE 'investor'::public.user_role
    END,
    participant_type = CASE s.tier
      WHEN 'institutional' THEN 'institutional'
      WHEN 'developer' THEN 'developer'
      ELSE 'investor'
    END,
    role_switch_in_progress_at = NULL,
    updated_at = now()
  FROM public.investor_subscriptions s
  WHERE s.user_id = p.user_id
    AND s.status IN ('active', 'trial')
    AND (
      p.role::text IS DISTINCT FROM CASE s.tier
        WHEN 'institutional' THEN 'institutional'
        WHEN 'developer' THEN 'developer'
        ELSE 'investor'
      END
      OR p.participant_type IS DISTINCT FROM CASE s.tier
        WHEN 'institutional' THEN 'institutional'
        WHEN 'developer' THEN 'developer'
        ELSE 'investor'
      END
      OR p.role_switch_in_progress_at IS NOT NULL
    );

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role_trg'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_guard_admin_and_role_trg'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_guard_admin_and_role'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role';
    END IF;
    RAISE;
END $$;

COMMENT ON FUNCTION public.sync_profile_role_from_investor_subscription() IS
  'Activates investor/institutional/developer profile role only after investor_subscriptions reaches active/trial.';
