ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_delivery_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_delivery_identity_uidx
  ON public.messages (sender_id, client_delivery_id)
  WHERE client_delivery_id IS NOT NULL;

COMMENT ON COLUMN public.messages.client_delivery_id IS
  'Client-generated idempotency key used to reconcile optimistic and realtime delivery without conflating identical messages.';
