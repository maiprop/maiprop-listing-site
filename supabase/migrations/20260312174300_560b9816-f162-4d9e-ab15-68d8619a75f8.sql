
-- Grant admin (agent) role to kostisrenios@gmail.com
UPDATE public.profiles
SET role = 'agent'
WHERE user_id = 'bfe73d89-c715-40ee-bccc-f6e71677ea71';

-- Auto-grant admin role to owner emails on signup
CREATE OR REPLACE FUNCTION public.auto_grant_owner_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IN ('kr@maiprop.co', 'kostisrenios@gmail.com') THEN
    UPDATE public.profiles SET role = 'agent' WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_owner
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_grant_owner_privileges();
