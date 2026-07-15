-- Forward repair for environments where the promotion remediation migration
-- was recorded before these foreign-key indexes were added to its source file.
CREATE INDEX IF NOT EXISTS idx_listing_promotion_addon_purchase_id
  ON public.listing_promotion_allocations (addon_purchase_id);

CREATE INDEX IF NOT EXISTS idx_listing_promotion_billing_subscription_id
  ON public.listing_promotion_allocations (billing_subscription_id);

CREATE INDEX IF NOT EXISTS idx_listing_promotion_created_by
  ON public.listing_promotion_allocations (created_by);
