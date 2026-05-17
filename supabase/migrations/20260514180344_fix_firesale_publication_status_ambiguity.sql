-- Fix Supabase DB lint error in admin_set_firesale_investor_publication:
-- the RETURNS TABLE column named "status" makes an unqualified status
-- reference ambiguous inside PL/pgSQL. Use the row locked earlier instead.

CREATE OR REPLACE FUNCTION public.admin_set_firesale_investor_publication(
  p_deal_id UUID,
  p_published BOOLEAN
)
RETURNS TABLE (
  deal_id UUID,
  status TEXT,
  published_to_investors BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal public.firesale_requests%ROWTYPE;
BEGIN
  IF NOT public.has_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_deal
  FROM public.firesale_requests
  WHERE id = p_deal_id
  FOR UPDATE;

  IF v_deal.id IS NULL THEN
    RAISE EXCEPTION 'firesale_request_not_found';
  END IF;

  UPDATE public.firesale_requests fr
  SET
    published_to_investors = p_published,
    status = CASE
      WHEN p_published THEN 'reviewed'
      WHEN v_deal.status = 'reviewed' THEN 'pending'
      ELSE v_deal.status
    END
  WHERE fr.id = p_deal_id
  RETURNING fr.* INTO v_deal;

  RETURN QUERY SELECT v_deal.id, v_deal.status, v_deal.published_to_investors;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) IS
  'Admin-only Quick Sale publication workflow. Atomically changes the investor visibility flag and compatible screening status.';
