
-- projects table for developer project showcases
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  city TEXT,
  address TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Projects are publicly viewable') THEN
    CREATE POLICY "Projects are publicly viewable" ON public.projects FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Owners manage own projects') THEN
    CREATE POLICY "Owners manage own projects" ON public.projects FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- grant_platform_admin_by_email RPC (security definer so only existing admin can call)
CREATE OR REPLACE FUNCTION public.grant_platform_admin_by_email(target_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Only current platform admins may call this
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Permission denied: caller is not a platform admin';
  END IF;

  -- Find target user by email via profiles (display_name won't work; use auth.users join)
  SELECT au.id INTO target_user_id
  FROM auth.users au
  WHERE au.email = target_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', target_email;
  END IF;

  -- Remove admin from caller, grant to target
  UPDATE public.profiles SET is_platform_admin = false WHERE user_id = auth.uid();
  UPDATE public.profiles SET is_platform_admin = true WHERE user_id = target_user_id;
END;
$$;
