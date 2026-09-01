CREATE INDEX IF NOT EXISTS idx_os_auction_duplicate_quarantine_canonical_listing_id
ON private.os_auction_duplicate_quarantine (canonical_listing_id);

COMMENT ON INDEX private.idx_os_auction_duplicate_quarantine_canonical_listing_id IS
  'Supports canonical-listing foreign-key checks and duplicate-quarantine convergence reads.';
