-- Add pre-qualification / due diligence columns to open_house_registrations
ALTER TABLE open_house_registrations
  ADD COLUMN IF NOT EXISTS mortgage_status TEXT,
  ADD COLUMN IF NOT EXISTS budget_range TEXT,
  ADD COLUMN IF NOT EXISTS working_with_agent TEXT,
  ADD COLUMN IF NOT EXISTS screening_doc_url TEXT;

-- Computed screening score: 0-5
-- +2 if pre-approved / funds available
-- +1 if working with agent
-- +2 if uploaded a screening document
ALTER TABLE open_house_registrations
  ADD COLUMN IF NOT EXISTS screening_score INTEGER GENERATED ALWAYS AS (
    CASE WHEN mortgage_status = 'yes' THEN 2 ELSE 0 END +
    CASE WHEN working_with_agent = 'yes' THEN 1 ELSE 0 END +
    CASE WHEN screening_doc_url IS NOT NULL THEN 2 ELSE 0 END
  ) STORED;
