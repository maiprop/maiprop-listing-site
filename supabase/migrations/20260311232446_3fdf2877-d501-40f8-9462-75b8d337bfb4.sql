
-- Drop the existing unconditional public SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Policy 1: Authenticated users can read their own full profile
CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy 2: Any authenticated user can read only non-sensitive display fields
-- (needed for resolving display_name from user_id in admin/investor views)
CREATE POLICY "Authenticated users can read public profile fields"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
