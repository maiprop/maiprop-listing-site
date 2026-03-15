-- Add optional agent KPIs to professionals (for real_estate_agent category)
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS average_deal_size text,
  ADD COLUMN IF NOT EXISTS average_portfolio_asset_size text;

COMMENT ON COLUMN professionals.average_deal_size IS 'e.g. €250K, €1.2M - average transaction size';
COMMENT ON COLUMN professionals.average_portfolio_asset_size IS 'e.g. €500K - average portfolio/asset size under management';
