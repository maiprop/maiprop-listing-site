-- Add-on purchase rows are a billing fulfillment ledger. Browser sessions may
-- read their own rows through RLS, but every write or schema-control privilege
-- must stay behind the service-role Edge boundary.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.addon_purchases
  FROM anon, authenticated;

REVOKE ALL ON TABLE public.addon_purchases FROM anon;
GRANT SELECT ON TABLE public.addon_purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.addon_purchases
  TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'addon_purchases'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN (
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      )
  ) THEN
    RAISE EXCEPTION 'addon_purchases must not grant browser write or schema-control privileges';
  END IF;
END
$$;
