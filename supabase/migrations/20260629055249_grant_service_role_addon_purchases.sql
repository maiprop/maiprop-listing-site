-- Edge webhook fulfillment writes paid add-on ledgers with the service role.
-- Earlier hardening migrations revoke broad default privileges, so grant the
-- exact DML surface this billing table needs.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.addon_purchases TO service_role;
