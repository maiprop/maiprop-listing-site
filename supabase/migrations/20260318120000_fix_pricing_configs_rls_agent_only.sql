-- Restrict pricing_configs modifications to agent role only.
-- Previously any authenticated user could INSERT/UPDATE/DELETE; Admin Pricing UI
-- was gated by OWNER_EMAILS but the database did not enforce it.

DROP POLICY IF EXISTS "Authenticated can modify pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Authenticated can update pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Authenticated can delete pricing_configs" ON public.pricing_configs;

CREATE POLICY "Agents can insert pricing_configs"
  ON public.pricing_configs FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'agent'::public.user_role));

CREATE POLICY "Agents can update pricing_configs"
  ON public.pricing_configs FOR UPDATE
  USING (public.has_role(auth.uid(), 'agent'::public.user_role))
  WITH CHECK (public.has_role(auth.uid(), 'agent'::public.user_role));

CREATE POLICY "Agents can delete pricing_configs"
  ON public.pricing_configs FOR DELETE
  USING (public.has_role(auth.uid(), 'agent'::public.user_role));
