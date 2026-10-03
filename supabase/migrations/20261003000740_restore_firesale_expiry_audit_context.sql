-- The expiry sweep sets these transaction-local audit fields for its row updates.
-- Function-scoped defaults restore the caller's values on every exit while
-- keeping reservation_expired on audit rows written inside the sweep.
BEGIN;

ALTER FUNCTION public.release_expired_firesale_reservations(uuid)
  SET maiprop.audit_action = '';

ALTER FUNCTION public.release_expired_firesale_reservations(uuid)
  SET maiprop.audit_actor = '';

COMMIT;
