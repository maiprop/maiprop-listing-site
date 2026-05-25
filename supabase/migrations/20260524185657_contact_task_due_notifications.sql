-- Create in-app reminders for overdue CRM contact tasks.
--
-- `contact_tasks.due_at` was previously only rendered in the CRM UI. This
-- adds a single-shot notification path so overdue tasks surface in the
-- existing notification bell without duplicating reminders on every cron run.

ALTER TABLE public.contact_tasks
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contact_tasks_due_unsent
  ON public.contact_tasks(due_at)
  WHERE completed_at IS NULL
    AND due_at IS NOT NULL
    AND reminder_sent_at IS NULL;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.reset_contact_task_reminder_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.completed_at IS NULL
     AND (
       NEW.due_at IS DISTINCT FROM OLD.due_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     ) THEN
    NEW.reminder_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reset_contact_task_reminder_marker() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reset_contact_task_reminder_marker() FROM anon, authenticated;

DROP TRIGGER IF EXISTS contact_tasks_reset_reminder_marker
  ON public.contact_tasks;

CREATE TRIGGER contact_tasks_reset_reminder_marker
  BEFORE UPDATE OF due_at, completed_at ON public.contact_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.reset_contact_task_reminder_marker();

CREATE OR REPLACE FUNCTION private.send_due_contact_task_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH due AS (
    UPDATE public.contact_tasks
    SET reminder_sent_at = now()
    WHERE completed_at IS NULL
      AND due_at IS NOT NULL
      AND due_at <= now()
      AND reminder_sent_at IS NULL
    RETURNING id, user_id, title, due_at
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, title, body, type)
    SELECT
      user_id,
      'Task due',
      concat(
        '"',
        title,
        '" was due ',
        to_char(due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'),
        ' UTC.'
      ),
      'contact_task_due'
    FROM due
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.send_due_contact_task_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.send_due_contact_task_notifications() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) AND EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'contact-task-due-notifications'
  ) THEN
    PERFORM cron.unschedule('contact-task-due-notifications');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) THEN
    RAISE NOTICE 'cron schema is unavailable; contact task due notification schedule was not installed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'contact-task-due-notifications',
    '0 * * * *',
    'SELECT private.send_due_contact_task_notifications();'
  );
END $$;

COMMENT ON FUNCTION private.send_due_contact_task_notifications() IS
  'Creates one in-app notification for each overdue incomplete contact task, then marks the reminder as sent.';
