-- Enforce sender-bound attachments, canonical project ownership, and durable
-- subscription lifecycle propagation for listing promotion allocations.

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

REVOKE INSERT ON TABLE public.message_attachments FROM PUBLIC, anon;
GRANT INSERT ON TABLE public.message_attachments TO authenticated, service_role;

DROP POLICY IF EXISTS message_attachments_insert
  ON public.message_attachments;
DROP POLICY IF EXISTS "Participants can insert message attachments"
  ON public.message_attachments;
CREATE POLICY message_attachments_insert
  ON public.message_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.messages AS message
      JOIN public.conversations AS conversation
        ON conversation.id = message.conversation_id
      WHERE message.id = message_attachments.message_id
        AND message.sender_id = (SELECT auth.uid())
        AND (
          conversation.participant_a = (SELECT auth.uid())
          OR conversation.participant_b = (SELECT auth.uid())
        )
    )
  );

-- Detach inconsistent historical links without inventing catalogue listings for
-- projects that do not have a canonical listing.
UPDATE public.listings AS listing
SET
  project_id = NULL,
  listing_type = 'sale'::public.listing_type,
  is_pre_sale = false
FROM public.projects AS project
WHERE project.id = listing.project_id
  AND project.owner_id IS DISTINCT FROM listing.owner_id;

CREATE OR REPLACE FUNCTION private.enforce_listing_project_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_owner_id uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project.owner_id
  INTO v_project_owner_id
  FROM public.projects AS project
  WHERE project.id = NEW.project_id;

  IF FOUND AND v_project_owner_id IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'listing_project_owner_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_project_listing_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND EXISTS (
       SELECT 1
       FROM public.listings AS listing
       WHERE listing.project_id = NEW.id
         AND listing.owner_id IS DISTINCT FROM NEW.owner_id
     ) THEN
    RAISE EXCEPTION 'project_listing_owner_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_listing_project_owner()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.enforce_project_listing_owner()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_00_enforce_listing_project_owner_insert
  ON public.listings;
CREATE TRIGGER trg_00_enforce_listing_project_owner_insert
  AFTER INSERT ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_listing_project_owner();

DROP TRIGGER IF EXISTS trg_00_enforce_listing_project_owner_update
  ON public.listings;
CREATE TRIGGER trg_00_enforce_listing_project_owner_update
  AFTER UPDATE OF project_id, owner_id ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_listing_project_owner();

DROP TRIGGER IF EXISTS trg_00_enforce_project_listing_owner
  ON public.projects;
CREATE TRIGGER trg_00_enforce_project_listing_owner
  BEFORE UPDATE OF owner_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_project_listing_owner();

DROP POLICY IF EXISTS listing_insert_quota ON public.listings;
CREATE POLICY listing_insert_quota
  ON public.listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.check_listing_quota())
    AND (
      COALESCE(listing_type::text, 'sale') <> 'new_build'
      OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
    AND (
      project_id IS NULL
      OR (
        (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND EXISTS (
          SELECT 1
          FROM public.projects AS project
          WHERE project.id = listings.project_id
            AND project.owner_id = listings.owner_id
            AND project.owner_id = (SELECT auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS listings_update ON public.listings;
CREATE POLICY listings_update
  ON public.listings
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (
      COALESCE(listing_type::text, 'sale') <> 'new_build'
      OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
    AND (
      project_id IS NULL
      OR (
        (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND EXISTS (
          SELECT 1
          FROM public.projects AS project
          WHERE project.id = listings.project_id
            AND project.owner_id = listings.owner_id
            AND project.owner_id = (SELECT auth.uid())
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION private.reconcile_plan_promotion_allocations(
  p_subscription_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reconciled integer := 0;
BEGIN
  UPDATE public.listing_promotion_allocations AS allocation
  SET
    status = 'revoked',
    revoked_at = statement_timestamp(),
    revoke_reason = CASE
      WHEN subscription.current_period_end IS NULL
        OR subscription.current_period_end <= statement_timestamp()
        THEN 'subscription_entitlement_lapsed'
      ELSE 'subscription_entitlement_terminal'
    END,
    updated_at = statement_timestamp()
  FROM public.billing_subscriptions AS subscription
  WHERE allocation.billing_subscription_id = subscription.id
    AND allocation.source_type = 'plan'
    AND allocation.status = 'active'
    AND (
      p_subscription_id IS NULL
      OR subscription.id = p_subscription_id
    )
    AND (
      subscription.current_period_end IS NULL
      OR subscription.current_period_end <= statement_timestamp()
      OR subscription.status NOT IN ('active', 'trialing', 'past_due')
    );

  GET DIAGNOSTICS v_reconciled = ROW_COUNT;
  RETURN v_reconciled;
END;
$$;

CREATE OR REPLACE FUNCTION private.reconcile_plan_promotion_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.reconcile_plan_promotion_allocations(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reconcile_plan_promotion_allocations(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reconcile_plan_promotion_subscription()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_reconcile_plan_promotion_subscription
  ON public.billing_subscriptions;
CREATE TRIGGER trg_reconcile_plan_promotion_subscription
  AFTER INSERT OR UPDATE OF status, current_period_end
  ON public.billing_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION private.reconcile_plan_promotion_subscription();

CREATE OR REPLACE FUNCTION public.expire_listing_promotions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM private.reconcile_plan_promotion_allocations(NULL);

  UPDATE public.listing_promotion_allocations
  SET status = 'expired', updated_at = statement_timestamp()
  WHERE status = 'active'
    AND ends_at <= statement_timestamp();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_listing_promotions()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_listing_promotions()
  TO service_role;

SELECT private.reconcile_plan_promotion_allocations(NULL);
