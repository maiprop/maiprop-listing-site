-- =============================================================================
-- Clean duplicate participant columns in conversations table
-- Removes old participant_1/participant_2 columns in favor of participant_a/participant_b
-- =============================================================================

-- First, ensure participant_a and participant_b are populated from participant_1/participant_2
-- (only if legacy participant_1/participant_2 columns exist — fresh installs skip this)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations'
      AND column_name IN ('participant_1', 'participant_2')
  ) THEN
    EXECUTE $sql$
      UPDATE conversations
      SET
        participant_a = COALESCE(participant_a, participant_1),
        participant_b = COALESCE(participant_b, participant_2)
      WHERE participant_a IS NULL OR participant_b IS NULL
    $sql$;
  END IF;
END $$;

-- Make participant_a and participant_b NOT NULL (they should already be populated)
ALTER TABLE conversations 
  ALTER COLUMN participant_a SET NOT NULL,
  ALTER COLUMN participant_b SET NOT NULL;

-- Drop policies that depend on participant_1/participant_2 before dropping columns
DROP POLICY IF EXISTS "Participants can view their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;

-- Drop the duplicate columns
ALTER TABLE conversations 
  DROP COLUMN IF EXISTS participant_1,
  DROP COLUMN IF EXISTS participant_2;

-- Update indexes to use the correct column names (drop and recreate)
DROP INDEX IF EXISTS idx_conversations_participant_a;
DROP INDEX IF EXISTS idx_conversations_participant_b;
DROP INDEX IF EXISTS idx_conversations_participant_a_last;
DROP INDEX IF EXISTS idx_conversations_participant_b_last;
DROP INDEX IF EXISTS idx_conversations_participants_unique;

-- Recreate indexes with correct names
CREATE INDEX idx_conversations_participant_a ON conversations(participant_a);
CREATE INDEX idx_conversations_participant_b ON conversations(participant_b);
CREATE INDEX idx_conversations_participant_a_last ON conversations(participant_a, last_message_at DESC);
CREATE INDEX idx_conversations_participant_b_last ON conversations(participant_b, last_message_at DESC);
CREATE UNIQUE INDEX idx_conversations_participants_unique ON conversations(
  LEAST(participant_a::text, participant_b::text),
  GREATEST(participant_a::text, participant_b::text)
);

-- Update RLS policies to use correct column names
DROP POLICY IF EXISTS "Participants can view conversations" ON conversations;
CREATE POLICY "Participants can view conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = participant_a OR auth.uid() = participant_b);

DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

-- Update message-related policies that reference conversation participants
DROP POLICY IF EXISTS "Participants can view messages" ON messages;
CREATE POLICY "Participants can view messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c 
      WHERE c.id = messages.conversation_id 
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants can send messages" ON messages;
CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c 
      WHERE c.id = conversation_id 
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );

-- Update message attachment policies
DROP POLICY IF EXISTS "Participants can view message attachments" ON message_attachments;
CREATE POLICY "Participants can view message attachments"
  ON message_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_attachments.message_id
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants can insert message attachments" ON message_attachments;
CREATE POLICY "Participants can insert message attachments"
  ON message_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = conversation_id
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );
