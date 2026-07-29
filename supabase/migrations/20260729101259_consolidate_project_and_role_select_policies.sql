-- Remove legacy permissive SELECT policies that are exact duplicates or
-- strict subsets of the canonical policies. Keeping both makes PostgreSQL
-- evaluate redundant predicates for every matching query.

DROP POLICY IF EXISTS projects_anon_select
  ON public.projects;

DROP POLICY IF EXISTS projects_authenticated_select
  ON public.projects;

DROP POLICY IF EXISTS "Users can view their own roles"
  ON public.user_roles;
