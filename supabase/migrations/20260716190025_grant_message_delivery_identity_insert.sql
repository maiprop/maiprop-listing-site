-- Message inserts are deliberately column-scoped. Extend the established
-- participant grant only to the client-generated delivery identity.
GRANT INSERT (client_delivery_id) ON public.messages TO authenticated;
