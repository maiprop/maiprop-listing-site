-- Add dedicated participant_type column to profiles
-- Replaces the fragile bio __type: prefix hack
-- Backfills from existing bio values

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS participant_type TEXT
  CHECK (participant_type IN ('buyer','seller','agent','developer','professional'));

-- Backfill from bio field
UPDATE profiles
SET participant_type = CASE
  WHEN bio LIKE '__type:buyer%'        THEN 'buyer'
  WHEN bio LIKE '__type:seller%'       THEN 'seller'
  WHEN bio LIKE '__type:agent%'        THEN 'agent'
  WHEN bio LIKE '__type:developer%'    THEN 'developer'
  WHEN bio LIKE '__type:professional%' THEN 'professional'
  WHEN role = 'agent'                  THEN 'agent'
  WHEN role = 'seller_landlord'        THEN 'seller'
  WHEN role = 'developer'              THEN 'developer'
  WHEN role = 'professional'           THEN 'professional'
  ELSE 'buyer'
END
WHERE participant_type IS NULL;

-- Index for fast dashboard routing and directory filtering
CREATE INDEX IF NOT EXISTS idx_profiles_participant_type
  ON profiles(participant_type)
  WHERE participant_type IS NOT NULL;

-- Also add investor_mode flag (boolean feature toggle on any participant)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS investor_mode BOOLEAN NOT NULL DEFAULT false;

-- RLS: users can update their own participant_type and investor_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users update own participant_type'
  ) THEN
    CREATE POLICY "Users update own participant_type"
      ON profiles FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
